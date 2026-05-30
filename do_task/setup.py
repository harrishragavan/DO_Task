import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

def after_install():
    create_custom_fields_for_task()

def after_migrate():
    create_custom_fields_for_task()

def create_custom_fields_for_task():
    if frappe.get_meta("Task").has_field("task_activity"):
        return

    custom_fields = {
        "Task": [
            {
                "fieldname": "task_activity",
                "label": "Task Activity",
                "fieldtype": "Table",
                "options": "Task Activity",
                "insert_after": "description"
            }
        ]
    }
    create_custom_fields(custom_fields)
