# Do Task

<img width="1912" height="893" alt="image" src="https://github.com/user-attachments/assets/56dce58c-97f5-44f8-a33a-86db832b91b4" />



**A comprehensive Task Management System built on the Frappe Framework.**

## Introduction

**Do Task** is a specialized application designed to enhance task and project management within the Frappe/ERPNext ecosystem. It extends the standard capabilities by introducing tailored dashboards, activity tracking, and specific models for open-source contributions.

### Key Features
- **Customized Dashboards:** Includes dedicated interfaces for tracking progress across different roles and perspectives, including specialized views for Tasks, Projects, and Project Owners.
- **Task Activity Tracking:** Keeps detailed logs of all actions and updates related to individual tasks, providing a comprehensive history of task progression.
- **Open Source Contributions:** Offers dedicated tracking and management capabilities for handling both external and internal open-source efforts and contributions.
- **Enhanced Task Features:** Seamlessly extends core task management capabilities to provide more robust tracking, better organization, and deeper analytical insights.

---
## Installation

You can install this app using the [bench](https://github.com/frappe/bench) CLI:

1. **Go to your bench directory**
```bash
cd $PATH_TO_YOUR_BENCH
```

2. **Get the app**
```bash
bench get-app https://github.com/your-username/do_task.git
```

3. **Install the app on your site**
```bash
bench --site your_site_name install-app do_task
```

---

## Contributing

This app uses `pre-commit` for code formatting and linting to maintain code quality. Please [install pre-commit](https://pre-commit.com/#installation) and enable it for this repository:

```bash
cd apps/do_task
pre-commit install
```

Pre-commit is configured to use the following tools for checking and formatting your code:

- **ruff** (Python linting)
- **eslint** (JavaScript linting)
- **prettier** (Code formatting)
- **pyupgrade** (Python syntax upgrades)

---

## License

This project is licensed under the [MIT License](license.txt).
