/**
 * project_dashboard.js
 * Implementation with Pagination (10 per page) and Smooth Transitions
 */

frappe.provide("frappe.ui.pages");

frappe.pages["project_dashboard"].on_page_load = function (wrapper) {
	wrapper._project_dashboard = new ProjectDashboard(wrapper);
};

frappe.pages["project_dashboard"].on_page_show = function (wrapper) {
	if (wrapper._project_dashboard) {
		wrapper._project_dashboard.load_projects(true);
	}
};

class ProjectDashboard {
	constructor(wrapper) {
		this.wrapper = $(wrapper);
		this.page = frappe.ui.make_app_page({
			parent: wrapper,
			title: __("Project Dashboard"),
			single_column: true,
		});

		this.page_start = 0;
		this.page_length = 10;
		this.total_projects = 0;
		this.filters = { status: "", priority: "", project_type: "" };
		this.search_query = "";

		this.calendar_date = new Date();
		this.debounce_timer = null;

		frappe.require("/assets/do_task/css/task_dashboard.css");
		this.init();
	}

	async init() {
		this.view_type = localStorage.getItem("project_dashboard_view_type") || "card";
		await this.fetch_status_options();
		this.render_shell();
		this.update_view_active_class();
		this.bind_events();
		this.load_projects(true);
	}

	fetch_status_options() {
		return new Promise((resolve) => {
			frappe.model.with_doctype("Project", () => {
				const meta = frappe.get_meta("Project");
				
				const status_field = meta && meta.fields.find(f => f.fieldname === "status");
				this.status_options = status_field && status_field.options
					? status_field.options.split("\n").map(o => o.trim()).filter(Boolean)
					: ["Open", "Completed", "Cancelled"];
					
				const priority_field = meta && meta.fields.find(f => f.fieldname === "priority");
				this.priority_options = priority_field && priority_field.options
					? priority_field.options.split("\n").map(o => o.trim()).filter(Boolean)
					: ["Low", "Medium", "High"];

				const type_field = meta && meta.fields.find(f => f.fieldname === "project_type");
				this.project_type_options = type_field && type_field.options
					? type_field.options.split("\n").map(o => o.trim()).filter(Boolean)
					: [];

				resolve();
			});
		});
	}

	update_view_active_class() {
		const menu = this.page.main.find("#pd-dropdown-menu-content");
		menu.find(".td-dropdown-item").removeClass("active");
		if (this.view_type === "list") {
			menu.find("#pd-btn-list-view").addClass("active");
		} else if (this.view_type === "calendar") {
			menu.find("#pd-btn-calendar-view").addClass("active");
		} else {
			menu.find("#pd-btn-card-view").addClass("active");
		}
	}

	render_shell() {
		this.page.main.html(`
			<div class="td-dashboard-wrapper">
				<aside class="td-sidebar">
					<div class="td-sidebar-section">
						<div class="td-sidebar-section-title">${__("Task")}</div>
						<div class="td-nav-item" data-route="task_dashboard"><i class="fa fa-list"></i> ${__("Task Board")}</div>
						<div class="td-nav-item" data-route="task_dashboard/reports"><i class="fa fa-pie-chart"></i> ${__("Task Analytics")}</div>
					</div>
					<div class="td-sidebar-section">
						<div class="td-sidebar-section-title">${__("Project")}</div>
						<div class="td-nav-item td-nav-item-current"><i class="fa fa-folder-open"></i> ${__("Project Dashboard")}</div>
						<div class="td-nav-item" data-route="project_owner_dashboard"><i class="fa fa-briefcase"></i> ${__("Project Owner Dashboard")}</div>
					</div>
					<div class="td-sidebar-section">
						<div class="td-sidebar-section-title">${__("Contribution")}</div>
						<div class="td-nav-item" data-route="task_dashboard/contributions"><i class="fa fa-github"></i> ${__("Contribution Dashboard")}</div>
						<div class="td-nav-item" data-route="task_dashboard/pr_reports"><i class="fa fa-trophy"></i> ${__("PR Analysis")}</div>
					</div>
				</aside>
				<div class="td-sidebar-overlay"></div>
				<main class="td-main-content">
					<div class="td-header">
						<div class="td-title-area">
							<button class="td-sidebar-toggle"><i class="fa fa-bars"></i></button>
							<h1 id="pd-view-title">${__("Projects")}</h1>
						</div>
						<div class="td-actions">
							<div class="td-search-input-wrap">
								<i class="fa fa-search"></i>
								<input type="text" id="pd-project-search" placeholder="${__("Search...")}">
							</div>
							<div class="td-dropdown">
								<button class="td-btn-menu" id="pd-btn-menu-trigger" title="${__("Options")}">
									<i class="fa fa-cog"></i>
								</button>
								<div class="td-dropdown-menu" id="pd-dropdown-menu-content">
									<button class="td-dropdown-item" id="pd-btn-reload">
										<i class="fa fa-refresh"></i> ${__("Reload")}
									</button>
									<button class="td-dropdown-item" id="pd-btn-list-view">
										<i class="fa fa-list"></i> ${__("List View")}
									</button>
									<button class="td-dropdown-item" id="pd-btn-card-view">
										<i class="fa fa-th"></i> ${__("Card View")}
									</button>
									<button class="td-dropdown-item" id="pd-btn-calendar-view">
										<i class="fa fa-calendar"></i> ${__("Calendar View")}
									</button>
								</div>
							</div>
							<button class="td-btn-new" id="pd-btn-new-project"><i class="fa fa-plus"></i> ${__("New Project")}</button>
						</div>
					</div>
					<div id="pd-view-content"></div>
				</main>
				<button class="td-fab" id="pd-fab-new-project"><i class="fa fa-plus"></i></button>
			</div>
		`);
		this.render_projects_frame(this.page.main.find("#pd-view-content"));
	}

	render_projects_frame(container) {
		const status_options_html = (this.status_options || []).map(opt => `<option value="${opt}">${opt}</option>`).join("");
		const priority_options_html = (this.priority_options || []).map(opt => `<option value="${opt}">${opt}</option>`).join("");
		const type_options_html = (this.project_type_options || []).map(opt => `<option value="${opt}">${opt}</option>`).join("");
		
		container.html(`
			<div class="td-filter-bar">
				<button class="td-btn-filter-toggle" id="pd-btn-filter-toggle">
					<i class="fa fa-filter"></i> ${__("Filters")}
				</button>
				<div class="td-active-filters" id="pd-active-filters"></div>
			</div>
			<div class="td-filters-panel" id="pd-filters-panel" style="display: none;">
				<div class="td-filter-item">
					<label>Status</label>
					<select data-filter="status" class="pd-f-sel">
						<option value="">All Status</option>
						${status_options_html}
					</select>
				</div>
				<div class="td-filter-item">
					<label>Priority</label>
					<select data-filter="priority" class="pd-f-sel">
						<option value="">All Priority</option>
						${priority_options_html}
					</select>
				</div>
				${this.project_type_options.length > 0 ? `
				<div class="td-filter-item">
					<label>Project Type</label>
					<select data-filter="project_type" class="pd-f-sel">
						<option value="">All Types</option>
						${type_options_html}
					</select>
				</div>` : ''}
			</div>
			<div id="pd-project-container" class="td-task-grid"></div>
			<div id="pd-pagination-container" class="td-pagination"></div>
		`);

		container.find('[data-filter="status"]').val(this.filters.status);
		container.find('[data-filter="priority"]').val(this.filters.priority);
		container.find('[data-filter="project_type"]').val(this.filters.project_type);

		container.off("change", ".pd-f-sel").on("change", ".pd-f-sel", (e) => {
			this.filters[$(e.currentTarget).data("filter")] = $(e.currentTarget).val();
			this.page_start = 0;
			this.load_projects(true);
		});

		container.off("click", "#pd-btn-filter-toggle").on("click", "#pd-btn-filter-toggle", (e) => {
			$(e.currentTarget).toggleClass("active");
			container.find("#pd-filters-panel").slideToggle(200);
		});

		container.off("click", ".pd-filter-remove").on("click", ".pd-filter-remove", (e) => {
			const filter_key = $(e.currentTarget).data("key");
			this.filters[filter_key] = "";
			container.find(`[data-filter="${filter_key}"]`).val("");
			this.page_start = 0;
			this.load_projects(true);
		});
	}

	render_active_filters() {
		const container = this.page.main.find("#pd-active-filters");
		if (!container.length) return;
		let pills_html = "";
		if (this.filters.status) pills_html += `<span class="td-filter-pill">Status: ${this.filters.status} <i class="fa fa-times pd-filter-remove" data-key="status"></i></span>`;
		if (this.filters.priority) pills_html += `<span class="td-filter-pill">Priority: ${this.filters.priority} <i class="fa fa-times pd-filter-remove" data-key="priority"></i></span>`;
		if (this.filters.project_type) pills_html += `<span class="td-filter-pill">Type: ${this.filters.project_type} <i class="fa fa-times pd-filter-remove" data-key="project_type"></i></span>`;
		container.html(pills_html);
	}

	bind_events() {
		const main = this.page.main;

		main.on("click", ".td-sidebar-toggle, .td-sidebar-overlay", () => {
			main.find(".td-sidebar").toggleClass("active");
		});

		main.on("click", ".td-nav-item[data-route]", (e) => {
			const route = $(e.currentTarget).data("route");
			if (route) {
				frappe.set_route(route.split('/'));
			}
			if ($(window).width() <= 1200) main.find(".td-sidebar").removeClass("active");
		});

		main.off("click", "#pd-btn-menu-trigger").on("click", "#pd-btn-menu-trigger", (e) => {
			e.stopPropagation();
			main.find("#pd-dropdown-menu-content").toggleClass("active");
		});

		$(document).off("click.pd-menu-close").on("click.pd-menu-close", () => {
			main.find("#pd-dropdown-menu-content").removeClass("active");
		});

		main.on("click", "#pd-btn-reload", () => {
			this.load_projects(true);
		});

		main.on("click", "#pd-btn-list-view", () => {
			this.view_type = "list";
			localStorage.setItem("project_dashboard_view_type", "list");
			this.update_view_active_class();
			this.load_projects(true);
		});

		main.on("click", "#pd-btn-card-view", () => {
			this.view_type = "card";
			localStorage.setItem("project_dashboard_view_type", "card");
			this.update_view_active_class();
			this.load_projects(true);
		});

		main.on("click", "#pd-btn-calendar-view", () => {
			this.view_type = "calendar";
			localStorage.setItem("project_dashboard_view_type", "calendar");
			this.update_view_active_class();
			this.page_start = 0;
			this.load_projects(true);
		});

		main.on("click", ".pd-cal-prev", () => {
			this.calendar_date.setMonth(this.calendar_date.getMonth() - 1);
			this.load_projects(true);
		});

		main.on("click", ".pd-cal-next", () => {
			this.calendar_date.setMonth(this.calendar_date.getMonth() + 1);
			this.load_projects(true);
		});

		main.on("input", "#pd-project-search", (e) => {
			clearTimeout(this.debounce_timer);
			this.debounce_timer = setTimeout(() => {
				this.search_query = $(e.currentTarget).val();
				this.page_start = 0;
				this.load_projects(true);
			}, 400);
		});



		main.on("click", "#pd-btn-new-project, #pd-fab-new-project", () => {
			frappe.new_doc("Project");
		});

		main.on("click", ".td-task-card, .td-task-list-row", (e) => {
			if ($(e.target).closest('.pd-status-badge-clickable').length) return;
			const id = $(e.currentTarget).data("id");
			if (id) frappe.set_route("Form", "Project", id);
		});

		main.on("click", ".td-page-btn", (e) => {
			const action = $(e.currentTarget).data("action");
			if (action === "prev" && this.page_start > 0) {
				this.page_start -= this.page_length;
			} else if (action === "next" && (this.page_start + this.page_length) < this.total_projects) {
				this.page_start += this.page_length;
			}
			this.load_projects(true);
			window.scrollTo({ top: 0, behavior: 'smooth' });
		});
	}

	async load_projects(force = false) {
		const container = this.page.main.find("#pd-project-container");

		if (force) {
			container.css("opacity", "0.5");
			if (!container.find(".td-loader").length) {
				container.prepend('<div class="td-loader"></div>');
			}
		}

		const filters = [["docstatus", "=", 0]];
		if (this.filters.status) filters.push(["status", "=", this.filters.status]);
		if (this.filters.priority) filters.push(["priority", "=", this.filters.priority]);
		if (this.filters.project_type) filters.push(["project_type", "=", this.filters.project_type]);
		if (this.search_query) filters.push(["project_name", "like", `%${this.search_query}%`]);

		if (this.view_type === 'calendar') {
			let year = this.calendar_date.getFullYear();
			let month = this.calendar_date.getMonth();
			let firstDay = new Date(year, month, 1);
			let lastDay = new Date(year, month + 1, 0);
			let get_date_str = (d) => {
				let day = d.getDate();
				let m = d.getMonth() + 1;
				return d.getFullYear() + '-' + (m <= 9 ? '0' + m : m) + '-' + (day <= 9 ? '0' + day : day);
			};
			filters.push(["expected_end_date", "between", [get_date_str(firstDay), get_date_str(lastDay)]]);
		}

		try {
			const list_limit = this.view_type === 'calendar' ? 1000 : this.page_length;
			const list_start = this.view_type === 'calendar' ? 0 : this.page_start;

			const fields = ["name", "project_name", "status", "priority", "project_type", "expected_end_date", "percent_complete"];

			const [projects, total] = await Promise.all([
				frappe.db.get_list("Project", {
					fields: fields,
					filters: filters,
					limit_start: list_start,
					limit_page_length: list_limit,
					order_by: "modified desc"
				}),
				frappe.db.count("Project", { filters: filters })
			]);

			this.total_projects = total;

			this.render_project_cards(container, projects);
			this.render_pagination();
			this.render_active_filters();
			container.css("opacity", "1");
		} catch (e) {
			console.error(e);
			container.html('<div class="td-error">Failed to load projects. Please try again.</div>');
		}
	}

	render_project_cards(container, projects) {
		if (this.view_type === "calendar") {
			this.render_calendar_view(container, projects);
			return;
		}

		if (this.view_type === "list") {
			container.removeClass("td-task-grid").addClass("td-task-list");
		} else {
			container.removeClass("td-task-list").addClass("td-task-grid");
		}

		if (!projects.length) {
			container.html(`
				<div class="td-empty-state">
					<i class="fa fa-briefcase"></i>
					<h3>No Projects Found</h3>
					<p>Try adjusting your filters or create a new project to get started.</p>
				</div>
			`);
			return;
		}
		
		const html = projects.map(p => {
			let completion = p.percent_complete || 0;
			
			if (this.view_type === "list") {
				return `
					<div class="td-task-list-row" data-id="${p.name}">
						<div class="td-list-col td-list-project-subject">
							<span class="td-task-project">${frappe.utils.escape_html(p.project_type || "Standard")}</span>
							<h3 class="td-task-subject">${frappe.utils.escape_html(p.project_name || p.name)}</h3>
						</div>
						<div class="td-list-col td-list-badges">
							<span class="td-badge td-badge-status-${(p.status || "Open").replace(/\s+/g, '')}">${p.status || "Open"}</span>
							<span class="td-badge td-badge-priority-${p.priority || "Medium"}">${p.priority || "Medium"}</span>
						</div>
						<div class="td-list-col" style="flex: 1.5; align-items: center; display: flex;">
							<div style="width: 100%; background: #e5e7eb; border-radius: 4px; height: 8px; overflow: hidden;" title="${completion}% Complete">
								<div style="width: ${completion}%; background: var(--td-primary); height: 100%;"></div>
							</div>
						</div>
						<div class="td-list-col td-list-due">
							<div class="td-due-date"><i class="fa fa-calendar-o"></i> ${p.expected_end_date ? frappe.datetime.str_to_user(p.expected_end_date) : "No End Date"}</div>
						</div>
					</div>
				`;
			}

			return `
				<div class="td-task-card" data-id="${p.name}">
					<div class="td-card-header">
						<div class="td-task-project">${frappe.utils.escape_html(p.project_type || "Standard")}</div>
						<h3 class="td-task-subject">${frappe.utils.escape_html(p.project_name || p.name)}</h3>
					</div>
					<div class="td-card-badges">
						<span class="td-badge td-badge-status-${(p.status || "Open").replace(/\s+/g, '')}">${p.status || "Open"}</span>
						<span class="td-badge td-badge-priority-${p.priority || "Medium"}">${p.priority || "Medium"}</span>
					</div>
					<div style="margin-top: 12px; margin-bottom: 4px;">
						<div style="display: flex; justify-content: space-between; font-size: 12px; color: var(--td-text-muted); margin-bottom: 4px;">
							<span>Progress</span><span>${completion}%</span>
						</div>
						<div style="width: 100%; background: #e5e7eb; border-radius: 4px; height: 6px; overflow: hidden;">
							<div style="width: ${completion}%; background: var(--td-primary); height: 100%;"></div>
						</div>
					</div>
					<div class="td-card-footer" style="margin-top: 12px;">
						<div class="td-due-date"><i class="fa fa-calendar-o"></i> ${p.expected_end_date ? frappe.datetime.str_to_user(p.expected_end_date) : "No End Date"}</div>
					</div>
				</div>
			`;
		}).join("");
		container.html(html);
	}

	render_calendar_view(container, projects) {
		container.removeClass("td-task-list td-task-grid").addClass("td-task-calendar");
		let month = this.calendar_date.getMonth();
		let year = this.calendar_date.getFullYear();
		let firstDay = new Date(year, month, 1).getDay();
		let daysInMonth = new Date(year, month + 1, 0).getDate();

		let html = `<div class="td-calendar-wrapper" style="background: white; border: 1px solid var(--td-border); border-radius: 8px; padding: 15px; margin-top: 15px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); overflow-x: auto;">
			<div style="display: flex; justify-content: space-between; margin-bottom: 15px; align-items: center;">
				<button class="btn btn-default btn-sm pd-cal-prev"><i class="fa fa-chevron-left"></i></button>
				<h3 style="margin: 0; font-size: 18px; color: var(--td-text-main);"><i class="fa fa-calendar" style="color: var(--td-primary); margin-right: 8px;"></i>${this.calendar_date.toLocaleString('default', { month: 'long' })} ${year}</h3>
				<button class="btn btn-default btn-sm pd-cal-next"><i class="fa fa-chevron-right"></i></button>
			</div>
			<table class="table table-bordered td-calendar-table" style="width: 100%; table-layout: fixed; border-collapse: collapse;">
				<thead><tr>
					<th style="text-align: center; padding: 10px; background: #f9fafb; border: 1px solid #e5e7eb;">Sun</th>
					<th style="text-align: center; padding: 10px; background: #f9fafb; border: 1px solid #e5e7eb;">Mon</th>
					<th style="text-align: center; padding: 10px; background: #f9fafb; border: 1px solid #e5e7eb;">Tue</th>
					<th style="text-align: center; padding: 10px; background: #f9fafb; border: 1px solid #e5e7eb;">Wed</th>
					<th style="text-align: center; padding: 10px; background: #f9fafb; border: 1px solid #e5e7eb;">Thu</th>
					<th style="text-align: center; padding: 10px; background: #f9fafb; border: 1px solid #e5e7eb;">Fri</th>
					<th style="text-align: center; padding: 10px; background: #f9fafb; border: 1px solid #e5e7eb;">Sat</th>
				</tr></thead>
				<tbody><tr>`;

		let projectsByDate = {};
		projects.forEach(p => {
			if (p.expected_end_date) {
				let d_obj = new Date(p.expected_end_date);
				if (d_obj.getMonth() === month && d_obj.getFullYear() === year) {
					let day = d_obj.getDate();
					if (!projectsByDate[day]) projectsByDate[day] = [];
					projectsByDate[day].push(p);
				}
			}
		});

		let d = 1;
		for (let i = 0; i < 42; i++) {
			if (i % 7 === 0 && i > 0) html += `</tr><tr>`;
			if (i < firstDay || d > daysInMonth) {
				html += `<td style="height: 100px; background: #f9fafb; border: 1px solid #e5e7eb;"></td>`;
			} else {
				let currentDay = d;
				let day_projects = projectsByDate[currentDay] || [];
				let projects_html = day_projects.map(p => `<div class="td-task-card td-cal-event" data-id="${p.name}" style="background: var(--td-primary-light, #e0e7ff); color: var(--td-primary, #4f46e5); padding: 4px 6px; border-radius: 4px; font-size: 11px; margin-bottom: 4px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; border: 1px solid rgba(79, 70, 229, 0.2); box-shadow: none;" title="${p.project_name || p.name}">${p.project_name || p.name}</div>`).join("");
				html += `<td style="height: 100px; vertical-align: top; position: relative; border: 1px solid #e5e7eb; padding: 5px;">
					<div style="font-weight: bold; margin-bottom: 5px; font-size: 12px; color: var(--td-text-muted); text-align: right;">${d}</div>
					${projects_html}
				</td>`;
				d++;
			}
		}
		html += `</tr></tbody></table></div>`;
		container.html(html);
	}

	render_pagination() {
		const container = this.page.main.find("#pd-pagination-container");
		if (!container.length) return;

		if (this.total_projects <= this.page_length) {
			container.html("");
			return;
		}
		
		const current_page = Math.floor(this.page_start / this.page_length) + 1;
		const total_pages = Math.ceil(this.total_projects / this.page_length);
		
		container.html(`
			<button class="td-page-btn" data-action="prev" ${this.page_start === 0 ? "disabled" : ""}>
				<i class="fa fa-chevron-left"></i> Previous
			</button>
			<div class="td-page-info">${__("Page {0} of {1}", [current_page, total_pages])}</div>
			<button class="td-page-btn" data-action="next" ${(this.page_start + this.page_length) >= this.total_projects ? "disabled" : ""}>
				Next <i class="fa fa-chevron-right"></i>
			</button>
		`);
	}
}
