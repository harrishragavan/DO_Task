/**
 * task_dashboard.js
 * Implementation with Pagination (10 per page) and Smooth Transitions
 */

frappe.provide("frappe.ui.pages");

frappe.pages["task_dashboard"].on_page_load = function (wrapper) {
	wrapper._task_dashboard = new TaskDashboard(wrapper);
};

frappe.pages["task_dashboard"].on_page_show = function (wrapper) {
	if (wrapper._task_dashboard) {
		let route = frappe.get_route();
		if (route.length > 1 && ["tasks", "reports", "contributions", "pr_reports"].includes(route[1])) {
			wrapper._task_dashboard.switch_view(route[1]);
		} else {
			wrapper._task_dashboard.load_content();
		}
	}
};

class TaskDashboard {
	constructor(wrapper) {
		this.wrapper = $(wrapper);
		this.page = frappe.ui.make_app_page({
			parent: wrapper,
			title: __("Task Dashboard"),
			single_column: true,
		});

		// Task variables
		this.page_start = 0;
		this.page_length = 10;
		this.total_tasks = 0;
		this.filters = { status: "", priority: "", project: "", assigned_to: "" };
		this.search_query = "";

		// PR / Contribution variables
		this.pr_page_start = 0;
		this.pr_page_length = 10;
		this.total_contributions = 0;
		this.pr_filters = { status: "", module: "", contributer: "" };
		this.pr_search_query = "";

		this.current_view = "tasks";
		this.calendar_date = new Date();
		this.debounce_timer = null;

		frappe.require("/assets/do_task/css/task_dashboard.css");
		this.init();
	}

	async init() {
		this.view_type = localStorage.getItem("task_dashboard_view_type") || "card";
		await Promise.all([
			this.fetch_status_options(),
			this.fetch_pr_status_options()
		]);
		let route = frappe.get_route();
		if (route.length > 1 && ["tasks", "reports", "contributions", "pr_reports"].includes(route[1])) {
			this.current_view = route[1];
		}
		
		this.render_shell();
		this.update_view_active_class();
		this.bind_events();
		this.load_content();
	}

	fetch_status_options() {
		return new Promise((resolve) => {
			frappe.model.with_doctype("Task", () => {
				const meta = frappe.get_meta("Task");
				const status_field = meta && meta.fields.find(f => f.fieldname === "status");
				this.status_options = status_field && status_field.options
					? status_field.options.split("\n").map(o => o.trim()).filter(Boolean)
					: ["Open", "Working", "Completed", "Cancelled"];
				resolve();
			});
		});
	}

	fetch_pr_status_options() {
		return new Promise((resolve) => {
			frappe.model.with_doctype("Open Source Contribution", () => {
				const meta = frappe.get_meta("Open Source Contribution");
				const status_field = meta && meta.fields.find(f => f.fieldname === "status");
				this.pr_status_options = status_field && status_field.options
					? status_field.options.split("\n").map(o => o.trim()).filter(Boolean)
					: ["Open", "Merged", "Closed", "Pending Review"];
				resolve();
			});
		});
	}

	update_view_active_class() {
		const menu = this.page.main.find("#td-dropdown-menu-content");
		menu.find(".td-dropdown-item").removeClass("active");
		if (this.view_type === "list") {
			menu.find("#td-btn-list-view").addClass("active");
		} else if (this.view_type === "calendar") {
			menu.find("#td-btn-calendar-view").addClass("active");
		} else {
			menu.find("#td-btn-card-view").addClass("active");
		}
	}

	render_shell() {
		this.page.main.html(`
			<div class="td-dashboard-wrapper">
				<aside class="td-sidebar">
					<div class="td-sidebar-section">
						<div class="td-sidebar-section-title">${__("Task")}</div>
						<div class="td-nav-item active" data-view="tasks"><i class="fa fa-list"></i> ${__("Task Board")}</div>
						<div class="td-nav-item" data-view="reports"><i class="fa fa-pie-chart"></i> ${__("Task Analytics")}</div>
					</div>
					<div class="td-sidebar-section">
						<div class="td-sidebar-section-title">${__("Project")}</div>
						<div class="td-nav-item" data-route="project_dashboard"><i class="fa fa-folder-open"></i> ${__("Project Dashboard")}</div>
						<div class="td-nav-item" data-route="project_owner_dashboard"><i class="fa fa-briefcase"></i> ${__("Project Owner Dashboard")}</div>
					</div>
					<div class="td-sidebar-section">
						<div class="td-sidebar-section-title">${__("Contribution")}</div>
						<div class="td-nav-item" data-view="contributions"><i class="fa fa-github"></i> ${__("Contribution Dashboard")}</div>
						<div class="td-nav-item" data-view="pr_reports"><i class="fa fa-trophy"></i> ${__("PR Analysis")}</div>
					</div>
					<div class="td-sidebar-section">
						<div class="td-sidebar-section-title">${__("Quick Actions")}</div>
						<div class="td-nav-item" data-action="my-tasks"><i class="fa fa-user"></i> ${__("My Tasks")}</div>
						<div class="td-nav-item" data-action="my-prs"><i class="fa fa-github-alt"></i> ${__("My PRs")}</div>
					</div>
				</aside>
				<div class="td-sidebar-overlay"></div>
				<main class="td-main-content">
					<div class="td-header">
						<div class="td-title-area">
							<button class="td-sidebar-toggle"><i class="fa fa-bars"></i></button>
							<h1 id="td-view-title">${__("Task Board")}</h1>
						</div>
						<div class="td-actions">
							<div class="td-search-input-wrap">
								<div style="position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: var(--td-text-light); display: flex;">${frappe.utils.icon('search', 'sm')}</div>
								<input type="text" id="td-task-search" placeholder="${__("Search...")}">
							</div>
							<div class="td-notification-wrap">
								<button class="td-btn-notification" id="td-btn-notification" title="${__("Notifications")}">
									<i class="fa fa-bell"></i>
									<span class="td-notification-badge">3</span>
								</button>
								<div class="td-notification-dropdown" id="td-notification-dropdown">
									<div class="td-notification-header">
										<h3>${__("Notifications")}</h3>
										<button id="td-mark-all-read">${__("Mark all as read")}</button>
									</div>
									<div class="td-notification-body">
										<div class="td-notification-item unread">
											<div class="td-notification-icon"><i class="fa fa-info-circle text-blue"></i></div>
											<div class="td-notification-content">
												<p><strong>System Update:</strong> DoTask version 16 is now live.</p>
												<span class="td-notification-time">10 mins ago</span>
											</div>
										</div>
										<div class="td-notification-item unread">
											<div class="td-notification-icon"><i class="fa fa-tasks text-green"></i></div>
											<div class="td-notification-content">
												<p><strong>New Task Assigned:</strong> Check the latest bug report.</p>
												<span class="td-notification-time">1 hour ago</span>
											</div>
										</div>
										<div class="td-notification-item unread">
											<div class="td-notification-icon"><i class="fa fa-exclamation-triangle text-orange"></i></div>
											<div class="td-notification-content">
												<p><strong>High Priority:</strong> Respond to pending PRs.</p>
												<span class="td-notification-time">2 hours ago</span>
											</div>
										</div>
									</div>
									<div class="td-notification-footer">
										<a href="#">${__("View all notifications")}</a>
									</div>
								</div>
							</div>
							<div class="td-dropdown">
								<button class="td-btn-menu" id="td-btn-menu-trigger" title="${__("Options")}">
									<i class="fa fa-cog"></i>
								</button>
								<div class="td-dropdown-menu" id="td-dropdown-menu-content">
									<button class="td-dropdown-item" id="td-btn-reload">
										<i class="fa fa-refresh"></i> ${__("Reload")}
									</button>
									<button class="td-dropdown-item" id="td-btn-list-view">
										<i class="fa fa-list"></i> ${__("List View")}
									</button>
									<button class="td-dropdown-item" id="td-btn-card-view">
										<i class="fa fa-th"></i> ${__("Card View")}
									</button>
									<button class="td-dropdown-item" id="td-btn-calendar-view">
										<i class="fa fa-calendar"></i> ${__("Calendar View")}
									</button>
								</div>
							</div>
							<button class="td-btn-new" id="td-btn-new-task"><i class="fa fa-plus"></i> ${__("New Task")}</button>
						</div>
					</div>
					<div id="td-view-content"></div>
				</main>
				<button class="td-fab" id="td-fab-new-task"><i class="fa fa-plus"></i></button>
			</div>
		`);
	}

	bind_events() {
		const main = this.page.main;

		main.on("click", ".td-sidebar-toggle, .td-sidebar-overlay", () => {
			main.find(".td-sidebar").toggleClass("active");
		});

		main.on("click", ".td-nav-item", (e) => {
			const $item = $(e.currentTarget);
			const view = $item.data("view");
			const action = $item.data("action");
			const route = $item.data("route");

			if (route) {
				frappe.set_route(route.split('/'));
				return;
			}

			if (view) {
				this.current_view = view;
				this.page_start = 0;
				this.pr_page_start = 0;
				main.find(".td-nav-item").removeClass("active");
				$item.addClass("active");

				// Reset filters where necessary
				if (view !== "tasks" && this.filters.assigned_to) {
					this.filters.assigned_to = "";
				}
				if (view !== "contributions" && this.pr_filters.contributer) {
					this.pr_filters.contributer = "";
				}

				this.load_content();
			} else if (action === "my-tasks") {
				this.current_view = "tasks";
				this.page_start = 0;
				main.find(".td-nav-item").removeClass("active");
				main.find('[data-view="tasks"]').addClass("active");
				this.filters.assigned_to = frappe.session.user;
				this.load_content();
			} else if (action === "my-prs") {
				this.current_view = "contributions";
				this.pr_page_start = 0;
				main.find(".td-nav-item").removeClass("active");
				main.find('[data-view="contributions"]').addClass("active");
				this.pr_filters.contributer = frappe.session.user;
				this.load_content();
			}

			if ($(window).width() <= 1200) main.find(".td-sidebar").removeClass("active");
		});

		// Menu Dropdown Toggle
		main.off("click", "#td-btn-menu-trigger").on("click", "#td-btn-menu-trigger", (e) => {
			e.stopPropagation();
			main.find("#td-dropdown-menu-content").toggleClass("active");
			main.find("#td-notification-dropdown").removeClass("active");
		});

		main.off("click", "#td-btn-notification").on("click", "#td-btn-notification", (e) => {
			e.stopPropagation();
			main.find("#td-notification-dropdown").toggleClass("active");
			main.find("#td-dropdown-menu-content").removeClass("active");
		});

		main.off("click", "#td-mark-all-read").on("click", "#td-mark-all-read", (e) => {
			e.stopPropagation();
			main.find(".td-notification-item").removeClass("unread");
			main.find(".td-notification-badge").hide();
		});

		$(document).off("click.td-menu-close").on("click.td-menu-close", () => {
			main.find("#td-dropdown-menu-content").removeClass("active");
			main.find("#td-notification-dropdown").removeClass("active");
		});

		main.on("click", "#td-btn-reload", () => {
			if (this.current_view === "tasks") {
				this.load_tasks(true);
			} else if (this.current_view === "contributions") {
				this.load_contributions(true);
			} else {
				location.reload();
			}
		});

		main.on("click", "#td-btn-list-view", () => {
			this.view_type = "list";
			localStorage.setItem("task_dashboard_view_type", "list");
			this.update_view_active_class();
			if (this.current_view === "tasks") {
				this.load_tasks(true);
			} else if (this.current_view === "contributions") {
				this.load_contributions(true);
			}
		});

		main.on("click", "#td-btn-card-view", () => {
			this.view_type = "card";
			localStorage.setItem("task_dashboard_view_type", "card");
			this.update_view_active_class();
			if (this.current_view === "tasks") {
				this.load_tasks(true);
			} else if (this.current_view === "contributions") {
				this.load_contributions(true);
			}
		});

		main.on("click", "#td-btn-calendar-view", () => {
			this.view_type = "calendar";
			localStorage.setItem("task_dashboard_view_type", "calendar");
			this.update_view_active_class();
			if (this.current_view === "tasks") {
				this.page_start = 0;
				this.load_tasks(true);
			} else if (this.current_view === "contributions") {
				this.pr_page_start = 0;
				this.load_contributions(true);
			}
		});

		main.on("click", ".td-cal-prev", () => {
			this.calendar_date.setMonth(this.calendar_date.getMonth() - 1);
			this.load_tasks(true);
		});

		main.on("click", ".td-cal-next", () => {
			this.calendar_date.setMonth(this.calendar_date.getMonth() + 1);
			this.load_tasks(true);
		});

		main.on("input", "#td-task-search", (e) => {
			clearTimeout(this.debounce_timer);
			this.debounce_timer = setTimeout(() => {
				const val = $(e.currentTarget).val();
				if (this.current_view === "tasks") {
					this.search_query = val;
					this.page_start = 0;
					this.load_tasks(true);
				} else if (this.current_view === "contributions") {
					this.pr_search_query = val;
					this.pr_page_start = 0;
					this.load_contributions(true);
				}
			}, 400);
		});

		main.on("click", "#td-btn-new-task, #td-fab-new-task", () => {
			if (this.current_view === "tasks") {
				this.open_task_dialog();
			} else if (this.current_view === "contributions") {
				this.open_pr_dialog();
			}
		});

		// Pagination Events
		main.on("click", ".td-page-btn", (e) => {
			const $btn = $(e.currentTarget);
			const action = $btn.data("action");
			if (this.current_view === "tasks") {
				if (action === "prev" && this.page_start > 0) {
					this.page_start -= this.page_length;
				} else if (action === "next" && (this.page_start + this.page_length) < this.total_tasks) {
					this.page_start += this.page_length;
				}
				this.load_tasks(true);
			} else if (this.current_view === "contributions") {
				if (action === "prev" && this.pr_page_start > 0) {
					this.pr_page_start -= this.pr_page_length;
				} else if (action === "next" && (this.pr_page_start + this.pr_page_length) < this.total_contributions) {
					this.pr_page_start += this.pr_page_length;
				}
				this.load_contributions(true);
			}
			window.scrollTo({ top: 0, behavior: 'smooth' });
		});
	}

	load_content() {
		const container = this.page.main.find("#td-view-content");
		const main = this.page.main;

		if (this.current_view === "tasks") {
			main.find("#td-view-title").text(__("Task Board"));
			main.find(".td-search-input-wrap").show().find("input").val(this.search_query).attr("placeholder", __("Search tasks..."));
			main.find(".td-dropdown").show();
			main.find("#td-btn-new-task").show().html(`<i class="fa fa-plus"></i> ${__("New Task")}`);
			main.find("#td-fab-new-task").show();
			this.render_tasks_frame(container);
			this.load_tasks(true);
		} else if (this.current_view === "reports") {
			main.find("#td-view-title").text(__("Task Analytics"));
			main.find(".td-search-input-wrap").hide();
			main.find(".td-dropdown").hide();
			main.find("#td-btn-new-task").hide();
			main.find("#td-fab-new-task").hide();
			this.render_reports_frame(container);
			this.render_analytics();
		} else if (this.current_view === "contributions") {
			main.find("#td-view-title").text(__("Contribution"));
			main.find(".td-search-input-wrap").show().find("input").val(this.pr_search_query).attr("placeholder", __("Search PRs..."));
			main.find(".td-dropdown").show();
			main.find("#td-btn-new-task").show().html(`<i class="fa fa-plus"></i> ${__("New PR")}`);
			main.find("#td-fab-new-task").show();
			this.render_contributions_frame(container);
			this.load_contributions(true);
		} else if (this.current_view === "pr_reports") {
			main.find("#td-view-title").text(__("PR Analysis"));
			main.find(".td-search-input-wrap").hide();
			main.find(".td-dropdown").hide();
			main.find("#td-btn-new-task").hide();
			main.find("#td-fab-new-task").hide();
			this.render_pr_reports_frame(container);
			this.render_pr_analytics();
		}
	}

	render_active_filters() {
		const container = this.page.main.find("#td-active-filters");
		if (!container.length) return;
		let pills_html = "";
		if (this.filters.status) pills_html += `<span class="td-filter-pill">Status: ${this.filters.status} <i class="fa fa-times td-filter-remove" data-key="status"></i></span>`;
		if (this.filters.priority) pills_html += `<span class="td-filter-pill">Priority: ${this.filters.priority} <i class="fa fa-times td-filter-remove" data-key="priority"></i></span>`;
		if (this.filters.project) pills_html += `<span class="td-filter-pill">Project: ${this.filters.project} <i class="fa fa-times td-filter-remove" data-key="project"></i></span>`;
		if (this.filters.assigned_to) pills_html += `<span class="td-filter-pill">Assignee: ${this.filters.assigned_to} <i class="fa fa-times td-filter-remove" data-key="assigned_to"></i></span>`;
		container.html(pills_html);
	}

	render_tasks_frame(container) {
		const status_options_html = (this.status_options || []).map(opt => `<option value="${opt}">${opt}</option>`).join("");
		container.html(`
			<div class="td-filter-bar">
				<button class="td-btn-filter-toggle" id="td-btn-filter-toggle">
					<i class="fa fa-filter"></i> ${__("Filters")}
				</button>
				<div class="td-active-filters" id="td-active-filters"></div>
			</div>
			<div class="td-filters-panel" id="td-filters-panel" style="display: none;">
				<div class="td-filter-item">
					<label>Status</label>
					<select data-filter="status" class="td-f-sel">
						<option value="">All Status</option>
						${status_options_html}
					</select>
				</div>
				<div class="td-filter-item"><label>Priority</label><select data-filter="priority" class="td-f-sel"><option value="">All Priority</option><option value="Low">Low</option><option value="Medium">Medium</option><option value="High">High</option><option value="Urgent">Urgent</option></select></div>
				<div class="td-filter-item"><label>Project</label><div id="f-proj"></div></div>
				<div class="td-filter-item"><label>Assignee</label><div id="f-user"></div></div>
			</div>
			<div id="td-task-container" class="td-task-grid"></div>
			<div id="td-pagination-container" class="td-pagination"></div>
		`);

		// Set initial values in selects
		container.find('[data-filter="status"]').val(this.filters.status);
		container.find('[data-filter="priority"]').val(this.filters.priority);

		this.is_rendering = true;
		this.project_filter = frappe.ui.form.make_control({
			df: { fieldtype: "Link", options: "Project", placeholder: "Project", onchange: () => { if(this.is_rendering) return; this.filters.project = this.project_filter.get_value(); this.page_start = 0; this.load_tasks(true); } },
			parent: container.find("#f-proj"), render_input: true
		});
		if (this.filters.project) this.project_filter.set_value(this.filters.project);

		this.user_filter = frappe.ui.form.make_control({
			df: { fieldtype: "Link", options: "User", placeholder: "Assignee", onchange: () => { if(this.is_rendering) return; this.filters.assigned_to = this.user_filter.get_value(); this.page_start = 0; this.load_tasks(true); } },
			parent: container.find("#f-user"), render_input: true
		});
		if (this.filters.assigned_to) this.user_filter.set_value(this.filters.assigned_to);
		
		setTimeout(() => { this.is_rendering = false; }, 100);

		container.off("change", ".td-f-sel").on("change", ".td-f-sel", (e) => {
			this.filters[$(e.currentTarget).data("filter")] = $(e.currentTarget).val();
			this.page_start = 0;
			this.load_tasks(true);
		});

		container.off("click", "#td-btn-filter-toggle").on("click", "#td-btn-filter-toggle", (e) => {
			$(e.currentTarget).toggleClass("active");
			container.find("#td-filters-panel").slideToggle(200);
		});

		container.off("click", ".td-filter-remove").on("click", ".td-filter-remove", (e) => {
			const filter_key = $(e.currentTarget).data("key");
			if (filter_key === "project") {
				this.project_filter.set_value("");
			} else if (filter_key === "assigned_to") {
				this.user_filter.set_value("");
			} else {
				this.filters[filter_key] = "";
				container.find(`[data-filter="${filter_key}"]`).val("");
			}
			this.page_start = 0;
			this.load_tasks(true);
		});

		container.off("click", ".td-task-card, .td-task-list-row").on("click", ".td-task-card, .td-task-list-row", (e) => {
			if ($(e.target).closest('.td-btn-timesheet').length || $(e.target).closest('.td-status-badge-clickable').length) return;
			const id = $(e.currentTarget).data("id");
			if (id) frappe.set_route("Form", "Task", id);
		});

		container.off("click", ".td-btn-timesheet").on("click", ".td-btn-timesheet", (e) => {
			e.stopPropagation();
			const id = $(e.currentTarget).data("id");
			if (id) {
				this.show_task_activity_dialog(id);
			}
		});

		container.off("click", ".td-status-badge-clickable").on("click", ".td-status-badge-clickable", (e) => {
			e.stopPropagation();
			const task_id = $(e.currentTarget).data("id");
			const current_status = $(e.currentTarget).data("status");
			this.open_status_change_dialog(task_id, current_status);
		});
	}

	async load_tasks(force = false) {
		const container = this.page.main.find("#td-task-container");
		const summary_container = this.page.main.find("#td-summary-container");

		if (force) {
			container.css("opacity", "0.5");
			if (!container.find(".td-loader").length) {
				container.prepend('<div class="td-loader"></div>');
			}
		}

		const filters = [["docstatus", "=", 0]];
		if (this.filters.status) filters.push(["status", "=", this.filters.status]);
		if (this.filters.priority) filters.push(["priority", "=", this.filters.priority]);
		if (this.filters.project) filters.push(["project", "=", this.filters.project]);
		if (this.filters.assigned_to) filters.push(["_assign", "like", `%${this.filters.assigned_to}%`]);
		if (this.search_query) filters.push(["subject", "like", `%${this.search_query}%`]);

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
			filters.push(["exp_end_date", "between", [get_date_str(firstDay), get_date_str(lastDay)]]);
		}

		try {
			const list_limit = this.view_type === 'calendar' ? 1000 : this.page_length;
			const list_start = this.view_type === 'calendar' ? 0 : this.page_start;

			// Fetch tasks and total count in parallel
			const [tasks, total] = await Promise.all([
				frappe.db.get_list("Task", {
					fields: ["name", "subject", "project", "status", "priority", "exp_end_date", "_assign"],
					filters: filters,
					limit_start: list_start,
					limit_page_length: list_limit,
					order_by: "modified desc"
				}),
				frappe.db.count("Task", { filters: filters })
			]);

			this.total_tasks = total;

			this.render_task_cards(container, tasks);
			this.render_pagination();
			this.render_active_filters();
			container.css("opacity", "1");
		} catch (e) {
			console.error(e);
			container.html('<div class="td-error">Failed to load tasks. Please try again.</div>');
		}
	}

	async update_summary() {
		const summary_container = this.page.main.find("#td-summary-container");
		if (!summary_container.length) return;

		try {
			// Fetch counts for summary in parallel
			const [open, urgent, completed] = await Promise.all([
				frappe.db.count("Task", { filters: { status: "Open", docstatus: 0 } }),
				frappe.db.count("Task", { filters: { priority: "Urgent", status: ["!=", "Completed"], docstatus: 0 } }),
				frappe.db.count("Task", { filters: { status: "Completed", docstatus: 0 } })
			]);

			summary_container.html(`
				<div class="td-summary-card">
					<div class="td-summary-val">${open}</div>
					<div class="td-summary-label">${__("Open Tasks")}</div>
				</div>
				<div class="td-summary-card td-summary-urgent">
					<div class="td-summary-val">${urgent}</div>
					<div class="td-summary-label">${__("Urgent Items")}</div>
				</div>
				<div class="td-summary-card">
					<div class="td-summary-val">${completed}</div>
					<div class="td-summary-label">${__("Completed")}</div>
				</div>
				<div class="td-summary-card">
					<div class="td-summary-val">${this.total_tasks}</div>
					<div class="td-summary-label">${__("Total Filtered")}</div>
				</div>
			`);
		} catch (e) {
			console.error("Summary error", e);
		}
	}

	render_task_cards(container, tasks) {
		if (this.view_type === "calendar") {
			this.render_calendar_view(container, tasks);
			return;
		}

		if (this.view_type === "list") {
			container.removeClass("td-task-grid").addClass("td-task-list");
		} else {
			container.removeClass("td-task-list").addClass("td-task-grid");
		}

		if (!tasks.length) {
			container.html(`
				<div class="td-empty-state">
					<i class="fa fa-tasks"></i>
					<h3>No Tasks Found</h3>
					<p>Try adjusting your filters or create a new task to get started.</p>
				</div>
			`);
			return;
		}
		const html = tasks.map(t => {
			let assignees = [];
			try { assignees = JSON.parse(t._assign || "[]"); } catch (e) { assignees = []; }

			const avatars = assignees.slice(0, 3).map(u => {
				const color = this.get_avatar_color(u);
				return `<div class="td-assignee-avatar" style="background: ${color}" title="${u}">${u.charAt(0).toUpperCase()}</div>`;
			}).join("");

			if (this.view_type === "list") {
				return `
					<div class="td-task-list-row" data-id="${t.name}">
						<div class="td-list-col td-list-project-subject">
							<span class="td-task-project">${frappe.utils.escape_html(t.project || "General")}</span>
							<h3 class="td-task-subject">${frappe.utils.escape_html(t.subject)}</h3>
						</div>
						<div class="td-list-col td-list-badges">
							<span class="td-badge td-badge-status-${(t.status || "Open").replace(/\s+/g, '')} td-status-badge-clickable" data-id="${t.name}" data-status="${t.status || 'Open'}" title="Click to change status" style="cursor: pointer;">${t.status || "Open"} <i class="fa fa-pencil" style="margin-left: 4px; font-size: 10px;"></i></span>
							<span class="td-badge td-badge-priority-${t.priority || "Medium"}">${t.priority || "Medium"}</span>
						</div>
						<div class="td-list-col td-list-assignees">
							<div class="td-assignees">${avatars} ${assignees.length > 3 ? `<span class="td-more-assignees">+${assignees.length - 3}</span>` : ""}</div>
						</div>
						<div class="td-list-col td-list-due">
							<div class="td-due-date"><i class="fa fa-calendar-o"></i> ${t.exp_end_date ? frappe.datetime.str_to_user(t.exp_end_date) : "No Due Date"}</div>
						</div>
						<div class="td-list-col td-list-timesheet" style="flex: 1.2; justify-content: center;">
							<button class="td-btn-timesheet" data-id="${t.name}">
								<i class="fa fa-clock-o"></i> View Activity
							</button>
						</div>
					</div>
				`;
			}

			return `
				<div class="td-task-card" data-id="${t.name}">
					<div class="td-card-header">
						<div class="td-task-project">${frappe.utils.escape_html(t.project || "General")}</div>
						<h3 class="td-task-subject">${frappe.utils.escape_html(t.subject)}</h3>
					</div>
					<div class="td-card-badges">
						<span class="td-badge td-badge-status-${(t.status || "Open").replace(/\s+/g, '')} td-status-badge-clickable" data-id="${t.name}" data-status="${t.status || 'Open'}" title="Click to change status" style="cursor: pointer;">${t.status || "Open"} <i class="fa fa-pencil" style="margin-left: 4px; font-size: 10px;"></i></span>
						<span class="td-badge td-badge-priority-${t.priority || "Medium"}">${t.priority || "Medium"}</span>
					</div>
					<div style="margin-top: 8px;">
						<button class="td-btn-timesheet" style="width: 100%;" data-id="${t.name}">
							<i class="fa fa-clock-o"></i> View Activity
						</button>
					</div>
					<div class="td-card-footer">
						<div class="td-assignees">${avatars} ${assignees.length > 3 ? `<span class="td-more-assignees">+${assignees.length - 3}</span>` : ""}</div>
						<div class="td-due-date"><i class="fa fa-calendar-o"></i> ${t.exp_end_date ? frappe.datetime.str_to_user(t.exp_end_date) : "No Due Date"}</div>
					</div>
				</div>
			`;
		}).join("");
		container.html(html);
	}

	get_avatar_color(user) {
		const colors = ["#6366f1", "#ec4899", "#8b5cf6", "#10b981", "#f59e0b", "#3b82f6"];
		let hash = 0;
		for (let i = 0; i < user.length; i++) {
			hash = user.charCodeAt(i) + ((hash << 5) - hash);
		}
		return colors[Math.abs(hash) % colors.length];
	}

	render_pagination() {
		const container = this.page.main.find("#td-pagination-container");
		if (!container.length) return;

		if (this.current_view === "tasks") {
			if (this.total_tasks <= this.page_length) {
				container.html("");
				return;
			}
			const current_page = Math.floor(this.page_start / this.page_length) + 1;
			const total_pages = Math.ceil(this.total_tasks / this.page_length);
			container.html(`
				<button class="td-page-btn" data-action="prev" ${this.page_start === 0 ? "disabled" : ""}>
					<i class="fa fa-chevron-left"></i> Previous
				</button>
				<div class="td-page-info">${__("Page {0} of {1}", [current_page, total_pages])}</div>
				<button class="td-page-btn" data-action="next" ${(this.page_start + this.page_length) >= this.total_tasks ? "disabled" : ""}>
					Next <i class="fa fa-chevron-right"></i>
				</button>
			`);
		} else if (this.current_view === "contributions") {
			if (this.total_contributions <= this.pr_page_length) {
				container.html("");
				return;
			}
			const current_page = Math.floor(this.pr_page_start / this.pr_page_length) + 1;
			const total_pages = Math.ceil(this.total_contributions / this.pr_page_length);
			container.html(`
				<button class="td-page-btn" data-action="prev" ${this.pr_page_start === 0 ? "disabled" : ""}>
					<i class="fa fa-chevron-left"></i> Previous
				</button>
				<div class="td-page-info">${__("Page {0} of {1}", [current_page, total_pages])}</div>
				<button class="td-page-btn" data-action="next" ${(this.pr_page_start + this.pr_page_length) >= this.total_contributions ? "disabled" : ""}>
					Next <i class="fa fa-chevron-right"></i>
				</button>
			`);
		}
	}

	render_active_analytics_filters() {
		const container = this.page.main.find("#td-active-analytics-filters");
		if (!container.length) return;
		let pills_html = "";
		
		const r_type = this.page.main.find("#td-resource-type").val() || 'task';
		pills_html += `<span class="td-filter-pill">Tracking: ${r_type} <i class="fa fa-times td-analytics-filter-remove" data-key="resource_type"></i></span>`;
		
		if (this.resource_specific_control) {
			const spec_val = this.resource_specific_control.get_value();
			if (spec_val) {
				pills_html += `<span class="td-filter-pill">Specific: ${spec_val} <i class="fa fa-times td-analytics-filter-remove" data-key="specific"></i></span>`;
			}
		}

		const s_type = this.page.main.find("#td-status-chart-type").val() || 'donut';
		if (s_type !== 'donut') pills_html += `<span class="td-filter-pill">Status Chart: ${s_type} <i class="fa fa-times td-analytics-filter-remove" data-key="status_chart"></i></span>`;
		
		const p_type = this.page.main.find("#td-priority-chart-type").val() || 'bar';
		if (p_type !== 'bar') pills_html += `<span class="td-filter-pill">Priority Chart: ${p_type} <i class="fa fa-times td-analytics-filter-remove" data-key="priority_chart"></i></span>`;

		container.html(pills_html);
	}

	render_reports_frame(container) {
		container.html(`
			<div class="td-filter-bar">
				<button class="td-btn-filter-toggle" id="td-btn-analytics-filter-toggle">
					<i class="fa fa-sliders"></i> ${__("Chart Settings")}
				</button>
				<div class="td-active-filters" id="td-active-analytics-filters"></div>
			</div>
			<div class="td-filters-panel" id="td-analytics-filters-panel" style="display: none;">
				<div class="td-filter-item">
					<label>Resource Tracking Type</label>
					<select id="td-resource-type" class="td-analytics-f-sel">
						<option value="task">Task Based Tracking (Overall)</option>
						<option value="assignee">Assignee Based Tracking</option>
						<option value="project">Project Based Tracking</option>
					</select>
				</div>
				<div class="td-filter-item" id="td-resource-specific-wrap" style="display: none;">
					<label id="td-resource-specific-label">Select Resource</label>
					<div id="td-resource-specific-control"></div>
				</div>
				<div class="td-filter-item">
					<label id="td-chart-1-label">Status Chart Type</label>
					<select id="td-status-chart-type" class="td-analytics-f-sel">
						<option value="donut">Donut</option>
						<option value="pie">Pie</option>
						<option value="bar">Bar</option>
						<option value="line">Line</option>
					</select>
				</div>
				<div class="td-filter-item">
					<label id="td-chart-2-label">Priority Chart Type</label>
					<select id="td-priority-chart-type" class="td-analytics-f-sel">
						<option value="bar">Bar</option>
						<option value="donut">Donut</option>
						<option value="pie">Pie</option>
						<option value="line">Line</option>
					</select>
				</div>
			</div>
			<div class="td-stats-grid">
				<div class="td-stat-card"><div id="c-status"></div></div>
				<div class="td-stat-card"><div id="c-priority"></div></div>
			</div>
		`);

		this.resource_specific_control = null;

		container.find("#td-resource-type").on("change", () => {
			const type = container.find("#td-resource-type").val();
			const wrap = container.find("#td-resource-specific-wrap");
			const ctrl_div = container.find("#td-resource-specific-control");
			ctrl_div.empty();
			
			if (type === 'assignee') {
				wrap.show();
				container.find("#td-resource-specific-label").text("Select Assignee:");
				this.resource_specific_control = frappe.ui.form.make_control({
					df: { fieldtype: "Link", options: "User", placeholder: "All Assignees", onchange: () => this.render_analytics() },
					parent: ctrl_div, render_input: true
				});
			} else if (type === 'project') {
				wrap.show();
				container.find("#td-resource-specific-label").text("Select Project:");
				this.resource_specific_control = frappe.ui.form.make_control({
					df: { fieldtype: "Link", options: "Project", placeholder: "All Projects", onchange: () => this.render_analytics() },
					parent: ctrl_div, render_input: true
				});
			} else {
				wrap.hide();
				this.resource_specific_control = null;
			}
			this.render_analytics();
		});

		container.find("#td-status-chart-type, #td-priority-chart-type").on("change", () => {
			this.render_analytics();
		});

		container.off("click", "#td-btn-analytics-filter-toggle").on("click", "#td-btn-analytics-filter-toggle", (e) => {
			$(e.currentTarget).toggleClass("active");
			container.find("#td-analytics-filters-panel").slideToggle(200);
		});

		container.off("click", ".td-analytics-filter-remove").on("click", ".td-analytics-filter-remove", (e) => {
			const filter_key = $(e.currentTarget).data("key");
			if (filter_key === "resource_type") {
				container.find("#td-resource-type").val("task").trigger("change");
			} else if (filter_key === "specific" && this.resource_specific_control) {
				this.resource_specific_control.set_value("");
			} else if (filter_key === "status_chart") {
				container.find("#td-status-chart-type").val("donut").trigger("change");
			} else if (filter_key === "priority_chart") {
				container.find("#td-priority-chart-type").val("bar").trigger("change");
			}
		});
		
		setTimeout(() => container.find("#td-resource-type").trigger("change"), 100);
	}

	async render_analytics() {
		const container = this.page.main.find("#td-view-content");
		container.find(".td-stat-card").append('<div class="td-chart-loader">Loading Chart...</div>');

		try {
			const resource_type = container.find("#td-resource-type").val() || 'task';
			let specific_value = null;
			if (this.resource_specific_control) {
				specific_value = this.resource_specific_control.get_value();
			}
			
			const tasks = await frappe.db.get_list("Task", {
				fields: ["status", "priority", "_assign", "project"],
				filters: { docstatus: 0 },
				limit: 1000
			});

			container.find(".td-chart-loader").remove();

			const data_1 = {}; 
			const data_2 = {};

			let title_1 = "";
			let title_2 = "";
			let colors_1 = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
			let colors_2 = ['#ef4444', '#f59e0b', '#3b82f6', '#10b981', '#ec4899'];

			if (resource_type === 'task') {
				container.find("#td-chart-1-label").text("Status Chart Type:");
				container.find("#td-chart-2-label").text("Priority Chart Type:");
				title_1 = "Tasks by Status";
				title_2 = "Tasks by Priority";
				tasks.forEach(t => {
					let stat = t.status || "Unknown";
					let prio = t.priority || "Unknown";
					data_1[stat] = (data_1[stat] || 0) + 1;
					data_2[prio] = (data_2[prio] || 0) + 1;
				});
			} else if (resource_type === 'assignee') {
				container.find("#td-chart-1-label").text(specific_value ? "Assignee Status Chart:" : "Assignee Chart Type:");
				container.find("#td-chart-2-label").text(specific_value ? "Assignee Priority Chart:" : "Assignee Priority Chart:");
				title_1 = specific_value ? `Status for ${specific_value}` : "Tasks by Assignee";
				title_2 = specific_value ? `Priority for ${specific_value}` : "Urgent/High Priority by Assignee";
				
				tasks.forEach(t => {
					let assignees = [];
					try { assignees = JSON.parse(t._assign || "[]"); } catch (e) { assignees = []; }
					
					if (specific_value) {
						if (assignees.includes(specific_value)) {
							let stat = t.status || "Unknown";
							let prio = t.priority || "Unknown";
							data_1[stat] = (data_1[stat] || 0) + 1;
							data_2[prio] = (data_2[prio] || 0) + 1;
						}
					} else {
						if (assignees.length === 0) {
							data_1["Unassigned"] = (data_1["Unassigned"] || 0) + 1;
						} else {
							assignees.forEach(a => {
								data_1[a] = (data_1[a] || 0) + 1;
								if (t.priority === "Urgent" || t.priority === "High") {
									data_2[a] = (data_2[a] || 0) + 1;
								}
							});
						}
					}
				});
			} else if (resource_type === 'project') {
				container.find("#td-chart-1-label").text(specific_value ? "Project Status Chart:" : "Project Chart Type:");
				container.find("#td-chart-2-label").text(specific_value ? "Project Priority Chart:" : "Project Status Chart:");
				title_1 = specific_value ? `Status for ${specific_value}` : "Tasks by Project";
				title_2 = specific_value ? `Priority for ${specific_value}` : "Completed Tasks by Project";
				
				tasks.forEach(t => {
					let proj = t.project || "No Project";
					
					if (specific_value) {
						if (proj === specific_value) {
							let stat = t.status || "Unknown";
							let prio = t.priority || "Unknown";
							data_1[stat] = (data_1[stat] || 0) + 1;
							data_2[prio] = (data_2[prio] || 0) + 1;
						}
					} else {
						data_1[proj] = (data_1[proj] || 0) + 1;
						if (t.status === "Completed") {
							data_2[proj] = (data_2[proj] || 0) + 1;
						}
					}
				});
			}

			if (Object.keys(data_1).length === 0) data_1["No Data"] = 1;
			if (Object.keys(data_2).length === 0) data_2["No Data"] = 1;

			const status_chart_type = container.find("#td-status-chart-type").val() || 'donut';
			const priority_chart_type = container.find("#td-priority-chart-type").val() || 'bar';

			container.find("#c-status").empty();
			container.find("#c-priority").empty();

			new frappe.Chart("#c-status", {
				title: title_1,
				data: { labels: Object.keys(data_1), datasets: [{ values: Object.values(data_1) }] },
				type: status_chart_type,
				height: 250,
				colors: colors_1
			});

			new frappe.Chart("#c-priority", {
				title: title_2,
				data: { labels: Object.keys(data_2), datasets: [{ values: Object.values(data_2) }] },
				type: priority_chart_type,
				height: 250,
				colors: colors_2
			});

			this.render_active_analytics_filters();
		} catch (e) {
			console.error("Analytics error", e);
			container.find(".td-chart-loader").remove();
			container.find("#c-status").html('<div class="td-error">Failed to load status chart.</div>');
			container.find("#c-priority").html('<div class="td-error">Failed to load priority chart.</div>');
		}
	}

	open_task_dialog() {
		frappe.new_doc("Task", {
			project: this.filters.project || ""
		});
	}

	show_task_activity_dialog(task_id) {
		const d = new frappe.ui.Dialog({
			title: __("Task Activity for {0}", [task_id]),
			size: "large",
			fields: [
				{
					fieldname: "activity_html",
					fieldtype: "HTML"
				}
			],
			primary_action_label: __("Add Activity"),
			primary_action: () => {
				this.open_add_activity_dialog(task_id, d);
			}
		});

		d.onhide = () => {
			setTimeout(() => {
				if (d && d.$wrapper) d.$wrapper.remove();
			}, 300);
		};
		d.show();
		this.render_task_activities(task_id, d);
	}

	render_task_activities(task_id, dialog) {
		dialog.fields_dict.activity_html.$wrapper.html('<div class="text-muted">Loading activities...</div>');
		frappe.call({
			method: "frappe.client.get",
			args: {
				doctype: "Task",
				name: task_id
			},
			callback: (r) => {
				if (!r.message || !r.message.task_activity || r.message.task_activity.length === 0) {
					dialog.fields_dict.activity_html.$wrapper.html('<div class="text-muted text-center" style="padding: 20px;">No activities found.</div>');
					return;
				}
				
				let activities = r.message.task_activity;
				// Sort by date descending
				activities.sort((a, b) => new Date(b.date) - new Date(a.date));

				let html = `
					<table class="table table-bordered table-hover" style="margin-bottom: 0;">
						<thead style="background-color: #f8f9fa;">
							<tr>
								<th style="width: 50px; text-align: center;">No.</th>
								<th style="width: 120px;">Date</th>
								<th>Work Done</th>
								<th style="width: 150px;">Done By</th>
							</tr>
						</thead>
						<tbody>
				`;
				
				activities.forEach((act, idx) => {
					let date_str = act.date ? frappe.datetime.str_to_user(act.date) : "";
					html += `
						<tr>
							<td style="text-align: center; vertical-align: middle;">${idx + 1}</td>
							<td style="vertical-align: middle;">${date_str}</td>
							<td style="vertical-align: middle; white-space: pre-wrap;">${frappe.utils.escape_html(act.work_done || '')}</td>
							<td style="vertical-align: middle;">${frappe.utils.escape_html(act.done_by || '')}</td>
						</tr>
					`;
				});
				html += `
						</tbody>
					</table>
				`;
				dialog.fields_dict.activity_html.$wrapper.html(html);
			}
		});
	}

	open_add_activity_dialog(task_id, parent_dialog) {
		const d = new frappe.ui.Dialog({
			title: __("Add Task Activity"),
			fields: [
				{ label: "Date", fieldname: "date", fieldtype: "Date", reqd: 1, default: frappe.datetime.get_today() },
				{ label: "Done By", fieldname: "done_by", fieldtype: "Link", options: "User", reqd: 1, default: frappe.session.user },
				{ label: "Work Done", fieldname: "work_done", fieldtype: "Data", reqd: 1 }
			],
			primary_action_label: __("Save"),
			primary_action: (v) => {
				d.get_primary_btn().prop('disabled', true);
				frappe.call({
					method: "frappe.client.get",
					args: {
						doctype: "Task",
						name: task_id
					},
					callback: (r) => {
						if (r.message) {
							let task = r.message;
							if (!task.task_activity) task.task_activity = [];
							task.task_activity.push({
								doctype: "Task Activity",
								date: v.date,
								work_done: v.work_done,
								done_by: v.done_by
							});
							frappe.call({
								method: "frappe.client.save",
								args: { doc: task },
								callback: (save_res) => {
									d.get_primary_btn().prop('disabled', false);
									if (!save_res.exc) {
										frappe.show_alert({ message: __("Activity added successfully"), indicator: "green" });
										d.hide();
										this.render_task_activities(task_id, parent_dialog);
									}
								}
							});
						} else {
							d.get_primary_btn().prop('disabled', false);
						}
					}
				});
			}
		});
		d.onhide = () => {
			setTimeout(() => {
				if (d && d.$wrapper) d.$wrapper.remove();
			}, 300);
		};
		d.show();
	}

	render_calendar_view(container, tasks) {
		container.removeClass("td-task-list td-task-grid").addClass("td-task-calendar");
		let month = this.calendar_date.getMonth();
		let year = this.calendar_date.getFullYear();
		let firstDay = new Date(year, month, 1).getDay();
		let daysInMonth = new Date(year, month + 1, 0).getDate();

		let html = `<div class="td-calendar-wrapper" style="background: white; border: 1px solid var(--td-border); border-radius: 8px; padding: 15px; margin-top: 15px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); overflow-x: auto;">
			<div style="display: flex; justify-content: space-between; margin-bottom: 15px; align-items: center;">
				<button class="btn btn-default btn-sm td-cal-prev"><i class="fa fa-chevron-left"></i></button>
				<h3 style="margin: 0; font-size: 18px; color: var(--td-text-main);"><i class="fa fa-calendar" style="color: var(--td-primary); margin-right: 8px;"></i>${this.calendar_date.toLocaleString('default', { month: 'long' })} ${year}</h3>
				<button class="btn btn-default btn-sm td-cal-next"><i class="fa fa-chevron-right"></i></button>
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

		let tasksByDate = {};
		tasks.forEach(t => {
			if (t.exp_end_date) {
				let d_obj = new Date(t.exp_end_date);
				if (d_obj.getMonth() === month && d_obj.getFullYear() === year) {
					let day = d_obj.getDate();
					if (!tasksByDate[day]) tasksByDate[day] = [];
					tasksByDate[day].push(t);
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
				let day_tasks = tasksByDate[currentDay] || [];
				let tasks_html = day_tasks.map(t => `<div class="td-task-card td-cal-event" data-id="${t.name}" style="background: var(--td-primary-light, #e0e7ff); color: var(--td-primary, #4f46e5); padding: 4px 6px; border-radius: 4px; font-size: 11px; margin-bottom: 4px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; border: 1px solid rgba(79, 70, 229, 0.2); box-shadow: none;" title="${t.subject}">${t.subject}</div>`).join("");
				html += `<td style="height: 100px; vertical-align: top; position: relative; border: 1px solid #e5e7eb; padding: 5px;">
					<div style="font-weight: bold; margin-bottom: 5px; font-size: 12px; color: var(--td-text-muted); text-align: right;">${d}</div>
					${tasks_html}
				</td>`;
				d++;
			}
		}
		html += `</tr></tbody></table></div>`;
		container.html(html);
	}

	open_status_change_dialog(task_id, current_status) {
		const d = new frappe.ui.Dialog({
			title: __("Change Status & Add Activity"),
			fields: [
				{ label: "New Status", fieldname: "status", fieldtype: "Select", options: this.status_options, default: current_status, reqd: 1 },
				{ label: "Completed On", fieldname: "completed_on", fieldtype: "Date", depends_on: "eval:doc.status==='Completed'", mandatory_depends_on: "eval:doc.status==='Completed'", default: frappe.datetime.get_today() },
				{ label: "Completed By", fieldname: "completed_by", fieldtype: "Link", options: "User", depends_on: "eval:doc.status==='Completed'", mandatory_depends_on: "eval:doc.status==='Completed'", default: frappe.session.user },
				{ label: "Outcome Hrs", fieldname: "custom_outcome_hrs", fieldtype: "Data", depends_on: "eval:doc.status==='Completed'", mandatory_depends_on: "eval:doc.status==='Completed'" },
				{ fieldtype: "Section Break", label: "Activity Details (Mandatory)" },
				{ label: "Date", fieldname: "date", fieldtype: "Date", reqd: 1, default: frappe.datetime.get_today() },
				{ label: "Done By", fieldname: "done_by", fieldtype: "Link", options: "User", reqd: 1, default: frappe.session.user },
				{ label: "Work Done", fieldname: "work_done", fieldtype: "Text", reqd: 1 }
			],
			primary_action_label: __("Update & Save"),
			primary_action: (v) => {
				d.get_primary_btn().prop('disabled', true);
				frappe.call({
					method: "frappe.client.get",
					args: { doctype: "Task", name: task_id },
					callback: (r) => {
						if (r.message) {
							let task = r.message;
							task.status = v.status;
							if (v.status === 'Completed') {
								task.completed_on = v.completed_on || frappe.datetime.get_today();
								task.completed_by = v.completed_by || frappe.session.user;
								task.custom_outcome_hrs = v.custom_outcome_hrs;
							}
							if (!task.task_activity) task.task_activity = [];
							task.task_activity.push({
								doctype: "Task Activity",
								date: v.date,
								work_done: v.work_done,
								done_by: v.done_by
							});
							frappe.call({
								method: "frappe.client.save",
								args: { doc: task },
								callback: (save_res) => {
									d.get_primary_btn().prop('disabled', false);
									if (!save_res.exc) {
										frappe.show_alert({ message: __("Task Updated"), indicator: "green" });
										d.hide();
										this.load_tasks(false);
									}
								}
							});
						} else {
							d.get_primary_btn().prop('disabled', false);
						}
					}
				});
			}
		});
		d.onhide = () => {
			setTimeout(() => {
				if (d && d.$wrapper) d.$wrapper.remove();
			}, 300);
		};
		d.show();
	}

	render_active_pr_filters() {
		const container = this.page.main.find("#td-active-pr-filters");
		if (!container.length) return;
		let pills_html = "";
		if (this.pr_filters.status) pills_html += `<span class="td-filter-pill">Status: ${this.pr_filters.status} <i class="fa fa-times td-pr-filter-remove" data-key="status"></i></span>`;
		if (this.pr_filters.module) pills_html += `<span class="td-filter-pill">Module: ${this.pr_filters.module} <i class="fa fa-times td-pr-filter-remove" data-key="module"></i></span>`;
		if (this.pr_filters.contributer) pills_html += `<span class="td-filter-pill">Contributor: ${this.pr_filters.contributer} <i class="fa fa-times td-pr-filter-remove" data-key="contributer"></i></span>`;
		container.html(pills_html);
	}

	render_contributions_frame(container) {
		const status_options_html = (this.pr_status_options || []).map(opt => `<option value="${opt}">${opt}</option>`).join("");
		container.html(`
			<div class="td-filter-bar">
				<button class="td-btn-filter-toggle" id="td-btn-pr-filter-toggle">
					<i class="fa fa-filter"></i> ${__("Filters")}
				</button>
				<div class="td-active-filters" id="td-active-pr-filters"></div>
			</div>
			<div class="td-filters-panel" id="td-pr-filters-panel" style="display: none;">
				<div class="td-filter-item">
					<label>Status</label>
					<select data-filter="status" class="td-pr-f-sel">
						<option value="">All Status</option>
						${status_options_html}
					</select>
				</div>
				<div class="td-filter-item"><label>Module</label><div id="f-module"></div></div>
				<div class="td-filter-item"><label>Contributor</label><div id="f-contributer"></div></div>
			</div>
			<div id="td-contributions-container" class="td-task-grid"></div>
			<div id="td-pagination-container" class="td-pagination"></div>
		`);

		container.find('.td-pr-f-sel[data-filter="status"]').val(this.pr_filters.status);

		this.is_rendering = true;
		this.module_filter = frappe.ui.form.make_control({
			df: {
				fieldtype: "Link",
				options: "Task Group",
				placeholder: "Module",
				onchange: () => {
					if(this.is_rendering) return;
					this.pr_filters.module = this.module_filter.get_value();
					this.pr_page_start = 0;
					this.load_contributions(true);
				}
			},
			parent: container.find("#f-module"),
			render_input: true
		});
		if (this.pr_filters.module) this.module_filter.set_value(this.pr_filters.module);

		this.contributer_filter = frappe.ui.form.make_control({
			df: {
				fieldtype: "Link",
				options: "User",
				placeholder: "Contributor",
				onchange: () => {
					if(this.is_rendering) return;
					this.pr_filters.contributer = this.contributer_filter.get_value();
					this.pr_page_start = 0;
					this.load_contributions(true);
				}
			},
			parent: container.find("#f-contributer"),
			render_input: true
		});
		if (this.pr_filters.contributer) this.contributer_filter.set_value(this.pr_filters.contributer);
		setTimeout(() => { this.is_rendering = false; }, 100);

		container.off("change", ".td-pr-f-sel").on("change", ".td-pr-f-sel", (e) => {
			this.pr_filters[$(e.currentTarget).data("filter")] = $(e.currentTarget).val();
			this.pr_page_start = 0;
			this.load_contributions(true);
		});

		container.off("click", "#td-btn-pr-filter-toggle").on("click", "#td-btn-pr-filter-toggle", (e) => {
			$(e.currentTarget).toggleClass("active");
			container.find("#td-pr-filters-panel").slideToggle(200);
		});

		container.off("click", ".td-pr-filter-remove").on("click", ".td-pr-filter-remove", (e) => {
			const filter_key = $(e.currentTarget).data("key");
			if (filter_key === "module") {
				this.module_filter.set_value("");
			} else if (filter_key === "contributer") {
				this.contributer_filter.set_value("");
			} else {
				this.pr_filters[filter_key] = "";
				container.find(`.td-pr-f-sel[data-filter="${filter_key}"]`).val("");
			}
			this.pr_page_start = 0;
			this.load_contributions(true);
		});

		container.off("click", ".td-task-card, .td-task-list-row").on("click", ".td-task-card, .td-task-list-row", (e) => {
			if ($(e.target).closest('.td-btn-timesheet').length) return; // Prevent navigation if clicking timesheet button
			const id = $(e.currentTarget).data("id");
			if (id) frappe.set_route("Form", "Open Source Contribution", id);
		});
	}

	async load_contributions(force = false) {
		const container = this.page.main.find("#td-contributions-container");
		if (!container.length) return;

		if (force) {
			container.css("opacity", "0.5");
			if (!container.find(".td-loader").length) {
				container.prepend('<div class="td-loader"></div>');
			}
		}

		const filters = [["docstatus", "=", 0]];
		if (this.pr_filters.status) filters.push(["status", "=", this.pr_filters.status]);
		if (this.pr_filters.module) filters.push(["module", "=", this.pr_filters.module]);
		if (this.pr_filters.contributer) filters.push(["contributer", "=", this.pr_filters.contributer]);
		if (this.pr_search_query) filters.push(["subject", "like", `%${this.pr_search_query}%`]);

		try {
			const [contributions, total] = await Promise.all([
				frappe.db.get_list("Open Source Contribution", {
					fields: ["name", "subject", "module", "status", "pr_descriptiom", "comments", "contributer", "owner", "creation"],
					filters: filters,
					limit_start: this.pr_page_start,
					limit_page_length: this.pr_page_length,
					order_by: "modified desc"
				}),
				frappe.db.count("Open Source Contribution", { filters: filters })
			]);

			this.total_contributions = total;
			this.render_contribution_cards(container, contributions);
			this.render_pagination();
			this.render_active_pr_filters();
			container.css("opacity", "1");
		} catch (e) {
			console.error(e);
			container.html('<div class="td-error">Failed to load contributions. Please try again.</div>');
		}
	}

	render_contribution_cards(container, contributions) {
		if (contributions.length === 0) {
			container.removeClass("td-task-list").addClass("td-task-grid");
			container.html(`
				<div class="td-empty-state">
					<i class="fa fa-github"></i>
					<h3>No Contributions Found</h3>
					<p>Try adjusting your filters or create a new contribution to get started.</p>
				</div>
			`);
			return;
		}

		const status_map = {
			"Open": "open",
			"Merged": "completed",
			"Closed": "cancelled",
			"Pending Review": "working"
		};

		if (this.view_type === "list") {
			container.removeClass("td-task-grid").addClass("td-task-list");
			const html = contributions.map(item => {
				const description = item.pr_descriptiom ? frappe.ellipsis(item.pr_descriptiom, 100) : "No description provided";
				const contributor = item.contributer || item.owner;
				const user_avatar = frappe.avatar(contributor);

				return `
					<div class="td-task-list-row" data-id="${item.name}">
						<div class="td-list-col td-list-project-subject">
							<span class="td-task-project">${item.module || "No Module"}</span>
							<h3 class="td-task-subject">${item.subject}</h3>
						</div>
						<div class="td-list-col" style="flex: 1.5; color: var(--td-text-muted); font-size: 13px;">
							${description}
						</div>
						<div class="td-list-col td-list-badges">
							<span class="td-badge td-badge-status-${status_map[item.status] || 'open'}">${item.status}</span>
						</div>
						<div class="td-list-col td-list-assignees">
							<div class="td-assignee" title="Contributor: ${contributor}" style="width: 32px; height: 32px; display: inline-block;">${user_avatar}</div>
						</div>
						<div class="td-list-col td-list-due">
							<div class="td-due-date">
								<i class="fa fa-calendar"></i> ${frappe.datetime.global_date_format(item.creation)}
							</div>
						</div>
					</div>
				`;
			}).join("");
			container.html(html);
		} else {
			container.removeClass("td-task-list").addClass("td-task-grid");
			const html = contributions.map(item => {
				const description = item.pr_descriptiom ? frappe.ellipsis(item.pr_descriptiom, 120) : "No description provided";
				const contributor = item.contributer || item.owner;
				const user_avatar = frappe.avatar(contributor);

				return `
					<div class="td-task-card" data-id="${item.name}">
						<div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
							<span class="td-task-project">${item.module || "No Module"}</span>
							<span class="td-badge td-badge-status-${status_map[item.status] || 'open'}">${item.status}</span>
						</div>
						<h3 class="td-task-subject">${item.subject}</h3>
						<p style="color: var(--td-text-muted); font-size: 13px; line-height: 1.5; margin: 12px 0;">${description}</p>
						<div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--td-border); padding-top: 12px; margin-top: auto;">
							<div class="td-due-date" style="color: var(--td-text-muted); font-size: 12px;">
								<i class="fa fa-calendar"></i> ${frappe.datetime.global_date_format(item.creation)}
							</div>
							<div class="td-assignees" style="display: flex; gap: 4px;">
								<div class="td-assignee" title="Contributor: ${contributor}" style="width: 32px; height: 32px; display: inline-block;">${user_avatar}</div>
							</div>
						</div>
					</div>
				`;
			}).join("");
			container.html(html);
		}
	}

	render_active_pr_analytics_filters() {
		const container = this.page.main.find("#td-active-pr-analytics-filters");
		if (!container.length) return;
		let pills_html = "";
		
		const s_type = this.page.main.find("#td-pr-status-chart-type").val() || 'donut';
		if (s_type !== 'donut') pills_html += `<span class="td-filter-pill">Status Chart: ${s_type} <i class="fa fa-times td-pr-analytics-filter-remove" data-key="status_chart"></i></span>`;
		
		const m_type = this.page.main.find("#td-pr-module-chart-type").val() || 'bar';
		if (m_type !== 'bar') pills_html += `<span class="td-filter-pill">Module Chart: ${m_type} <i class="fa fa-times td-pr-analytics-filter-remove" data-key="module_chart"></i></span>`;

		container.html(pills_html);
	}

	render_pr_reports_frame(container) {
		container.html(`
			<div class="td-filter-bar">
				<button class="td-btn-filter-toggle" id="td-btn-pr-analytics-filter-toggle">
					<i class="fa fa-sliders"></i> ${__("Chart Settings")}
				</button>
				<div class="td-active-filters" id="td-active-pr-analytics-filters"></div>
			</div>
			<div class="td-filters-panel" id="td-pr-analytics-filters-panel" style="display: none;">
				<div class="td-filter-item">
					<label>Status Chart Type</label>
					<select id="td-pr-status-chart-type" class="td-pr-analytics-f-sel">
						<option value="donut">Donut</option>
						<option value="pie">Pie</option>
						<option value="bar">Bar</option>
						<option value="line">Line</option>
					</select>
				</div>
				<div class="td-filter-item">
					<label>Module Chart Type</label>
					<select id="td-pr-module-chart-type" class="td-pr-analytics-f-sel">
						<option value="bar">Bar</option>
						<option value="donut">Donut</option>
						<option value="pie">Pie</option>
						<option value="line">Line</option>
					</select>
				</div>
			</div>
			<div class="td-stats-grid">
				<div class="td-stat-card"><div id="pr-c-status"></div></div>
				<div class="td-stat-card"><div id="pr-c-module"></div></div>
			</div>
			<div class="td-leaderboard-card" style="margin-top: 24px; background: var(--td-bg-card, #fff); border: 1px solid var(--td-border, #e5e7eb); border-radius: 12px; padding: 24px;">
				<h3 style="margin-top: 0; margin-bottom: 20px; font-size: 16px; font-weight: 600; color: var(--td-text-main, #111827); display: flex; align-items: center; gap: 8px;">
					<i class="fa fa-trophy" style="color: #f59e0b;"></i> ${__("Contributor Leaderboard")}
				</h3>
				<div id="td-leaderboard-content"></div>
			</div>
		`);

		container.find("#td-pr-status-chart-type, #td-pr-module-chart-type").on("change", () => {
			this.render_pr_analytics();
		});

		container.off("click", "#td-btn-pr-analytics-filter-toggle").on("click", "#td-btn-pr-analytics-filter-toggle", (e) => {
			$(e.currentTarget).toggleClass("active");
			container.find("#td-pr-analytics-filters-panel").slideToggle(200);
		});

		container.off("click", ".td-pr-analytics-filter-remove").on("click", ".td-pr-analytics-filter-remove", (e) => {
			const filter_key = $(e.currentTarget).data("key");
			if (filter_key === "status_chart") {
				container.find("#td-pr-status-chart-type").val("donut").trigger("change");
			} else if (filter_key === "module_chart") {
				container.find("#td-pr-module-chart-type").val("bar").trigger("change");
			}
		});
	}

	async render_pr_analytics() {
		const container = this.page.main.find("#td-view-content");
		container.find("#pr-c-status").empty();
		container.find("#pr-c-module").empty();
		container.find(".td-chart-loader").remove();
		container.find(".td-stat-card").append('<div class="td-chart-loader">Loading Chart...</div>');

		try {
			const contributions = await frappe.db.get_list("Open Source Contribution", {
				fields: ["status", "module", "contributer", "owner"],
				filters: { docstatus: 0 },
				limit: 200
			});

			container.find(".td-chart-loader").remove();

			const s_data = {};
			const m_data = {};
			const leaders = {};

			contributions.forEach(item => {
				s_data[item.status] = (s_data[item.status] || 0) + 1;
				const module_name = item.module || "Unassigned";
				m_data[module_name] = (m_data[module_name] || 0) + 1;

				const user = item.contributer || item.owner || "Unknown";
				leaders[user] = (leaders[user] || 0) + 1;
			});

			const pr_status_chart_type = container.find("#td-pr-status-chart-type").val() || 'donut';
			const pr_module_chart_type = container.find("#td-pr-module-chart-type").val() || 'bar';

			new frappe.Chart("#pr-c-status", {
				title: "Contributions by Status",
				data: { labels: Object.keys(s_data), datasets: [{ values: Object.values(s_data) }] },
				type: pr_status_chart_type,
				height: 250,
				colors: ['#10b981', '#6366f1', '#ef4444', '#f59e0b']
			});

			new frappe.Chart("#pr-c-module", {
				title: "Contributions by Module",
				data: { labels: Object.keys(m_data), datasets: [{ values: Object.values(m_data) }] },
				type: pr_module_chart_type,
				height: 250,
				colors: ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899']
			});

			this.render_active_pr_analytics_filters();

			// Render Leaderboard
			const sorted_leaders = Object.entries(leaders)
				.sort((a, b) => b[1] - a[1])
				.slice(0, 10);

			const leaderboard_container = container.find("#td-leaderboard-content");
			if (sorted_leaders.length === 0) {
				leaderboard_container.html(`<div style="color: var(--td-text-muted); font-size: 13px;">No contributions found to rank.</div>`);
			} else {
				let leader_html = `<div class="td-leaderboard-list" style="display: flex; flex-direction: column; gap: 12px;">`;
				sorted_leaders.forEach(([user, count], index) => {
					const rank = index + 1;
					let rank_badge = `<span style="font-weight: 600; width: 24px; text-align: center; color: var(--td-text-muted);">${rank}</span>`;
					if (rank === 1) rank_badge = `<span style="font-size: 16px; width: 24px; text-align: center;">🥇</span>`;
					else if (rank === 2) rank_badge = `<span style="font-size: 16px; width: 24px; text-align: center;">🥈</span>`;
					else if (rank === 3) rank_badge = `<span style="font-size: 16px; width: 24px; text-align: center;">🥉</span>`;

					const user_avatar = frappe.avatar(user);

					leader_html += `
						<div class="td-leaderboard-item" style="display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; border-radius: 8px; background: var(--td-bg-body, #f9fafb); border: 1px solid var(--td-border, #f3f4f6);">
							<div style="display: flex; align-items: center; gap: 12px;">
								${rank_badge}
								<div style="width: 32px; height: 32px; display: inline-block; margin-left: 8px;">${user_avatar}</div>
								<div style="font-weight: 500; color: var(--td-text-main); font-size: 14px; margin-left: 8px;">${user}</div>
							</div>
							<div style="display: flex; align-items: center; gap: 6px;">
								<span style="font-weight: 600; color: var(--td-primary); font-size: 15px;">${count}</span>
								<span style="color: var(--td-text-muted); font-size: 12px;">${count === 1 ? 'PR' : 'PRs'}</span>
							</div>
						</div>
					`;
				});
				leader_html += `</div>`;
				leaderboard_container.html(leader_html);
			}
		} catch (e) {
			console.error("PR Analytics error", e);
			container.find(".td-chart-loader").remove();
			container.find("#pr-c-status").html('<div class="td-error">Failed to load status chart.</div>');
			container.find("#pr-c-module").html('<div class="td-error">Failed to load module chart.</div>');
			container.find("#td-leaderboard-content").html('<div class="td-error">Failed to load leaderboard.</div>');
		}
	}

	open_pr_dialog() {
		frappe.new_doc("Open Source Contribution");
	}
}
