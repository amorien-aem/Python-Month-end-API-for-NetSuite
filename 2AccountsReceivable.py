import os
import sys
import pandas as pd
import jupyterlab_server as caas

if os.environ.get('HEADLESS'):
    tasks = [
        "Ensure all customer invoices are posted",
        "Apply all customer payments and match to invoices",
        "Review A/R Aging Report for overdue or unapplied credits",
        "Write-off bad debts if necessary",
        "Review Deferred Revenue schedules and post revenue recognition",
    ]
    import json, os
    os.makedirs('output', exist_ok=True)
    out = {'script':'2AccountsReceivable.py','summary':f'{len(tasks)} checklist items','items':tasks}
    with open(os.path.join('output','2AccountsReceivable.json'),'w') as f:
        json.dump(out, f)
    import csv
    with open(os.path.join('output','2AccountsReceivable.csv'),'w', newline='') as cf:
        w = csv.writer(cf)
        w.writerow(['item','completed'])
        for t in tasks:
            w.writerow([t,''])
    print(f"2AccountsReceivable.py: HEADLESS summary written to output/2AccountsReceivable.json and CSV")
    sys.exit(0)

import tkinter as tk
from pretty_html_table import build_table
from tkinter import ttk

#from itables import init_notebook_mode
#init_notebook_mode(all_interactive=True)

# Main application
root = tk.Tk()
root.title("Month-End Checklist")
root.geometry("300x400")

def update_progress():
    total_tasks = len(tasks)
    completed_tasks = sum(var.get() for var in task_vars)
    percentage = round((completed_tasks / total_tasks) * 100)
    progress_label.config(text=f"Progress: {percentage}%")

def create_scrollable_checklist(root, items):
    # Create a canvas and a scrollbar
    canvas = tk.Canvas(root)
    scrollbar = ttk.Scrollbar(root, orient="vertical", command=canvas.yview)
    scrollable_frame = ttk.Frame(canvas)
   
    canvas.create_window((0, 0), window=scrollable_frame, anchor="nw")
    canvas.configure(yscrollcommand=scrollbar.set)

# Create a frame for the checklist
frame = ttk.Frame(root, padding=10)
frame.pack(fill=tk.BOTH, expand=True)
  # Configure the canvas


    # Add checkboxes to the scrollable frame


# Title
title_label = ttk.Label(frame, text="2 Accounts Receivable", font=("Arial", 16))
title_label.pack(pady=10)

# Month End Close Checklist Data
tasks =  [
        "Ensure all customer invoices are posted",
        "Apply all customer payments and match to invoices",
        "Review A/R Aging Report for overdue or unapplied credits",
        "Write-off bad debts if necessary",
        "Review Deferred Revenue schedules and post revenue recognition",
       
    ]
   # "Assigned To": ["" for _ in range(36)],
   # "Due Date": ["" for _ in range(36)],
   # "Completed (Y/N)": ["" for _ in range(36)]

task_vars = []

for task in tasks:
    var = tk.IntVar()
    task_vars.append(var)
    checkbox = ttk.Checkbutton(frame, text=task, variable=var, command=update_progress)
    checkbox.pack(anchor=tk.W, pady=5)

# Progress label
progress_label = ttk.Label(frame, text="Progress: 0%", font=("Arial", 12))
progress_label.pack(pady=20)

# Run the application
root.mainloop()
