/* =========================================================
   Help Center FAQs — static, no backend needed.
   To add or change a question, edit this list and rebuild.
   Each item: { category, question, answer }
========================================================= */

export const FAQ_CATEGORIES = [
  "Getting Started",
  "Tasks",
  "Review & Comments",
  "Import",
  "Task Bank & Calendar",
  "Reports",
  "Meetings & Chat",
  "Notifications",
  "Account & Users",
];

export const FAQS = [
  /* ---------------- Getting Started ---------------- */
  {
    category: "Getting Started",
    question: "What is Blizz Board?",
    answer:
      "Blizz Board is a task management app for your team. You can create and assign tasks, track progress and deadlines, review completed work with a score, keep meeting minutes (MoM), chat with your team and see reports for every person.",
  },
  {
    category: "Getting Started",
    question: "What can each role do?",
    answer:
      "Admins manage the whole organization: users, departments, settings and all tasks.\nManagers create and assign tasks, review submitted work and see reports for their team.\nEmployees see the tasks assigned to them, update progress, send tasks for review and comment on them.\nThe exact menu you see depends on the permissions your admin has given your role.",
  },
  {
    category: "Getting Started",
    question: "Can I install Blizz Board as an app?",
    answer:
      "Yes. Click \"Install app\" in the top bar (Chrome / Edge) or use \"Add to Home Screen\" on your phone. It opens like a normal app and can show push notifications.",
  },

  /* ---------------- Tasks ---------------- */
  {
    category: "Tasks",
    question: "How do I create a new task?",
    answer:
      "Open Tasks and click New Task. Enter the title, description, department, assignee, priority, start date/time and end date (deadline), then save. The assigned person is notified immediately.",
  },
  {
    category: "Tasks",
    question: "What is the Task ID (e.g. DEV12, TEC18)?",
    answer:
      "Every task gets a Task ID automatically: the department code plus the next number (DEV1, DEV2…). You never type it. If a task has no department, it gets an ID like TSK-1. Admins can set a department's code in Settings → Departments.",
  },
  {
    category: "Tasks",
    question: "Can I assign one task to several people?",
    answer:
      "Yes. Select more than one assignee when creating the task. Each person gets their own copy with the same Task ID, so everyone's progress and review is tracked separately.",
  },
  {
    category: "Tasks",
    question: "What do the task statuses mean?",
    answer:
      "To Do — not started yet (0% progress).\nIn Progress — the assignee is working on it.\nReview — the assignee has finished and sent it to the assigner for checking.\nCompleted — the assigner approved the work.\nA task past its end date that is not completed is shown as Overdue.",
  },
  {
    category: "Tasks",
    question: "How do I update my task's progress?",
    answer:
      "Open the task and change its status (To Do → In Progress → Review). You can also tick off subtasks and checklist items; the progress bar updates with them.",
  },
  {
    category: "Tasks",
    question: "What is a rework Task ID like TECH14-1 or TECH14-DEV1?",
    answer:
      "When a task is sent back for rework as a new task, it keeps the original ID with a suffix:\nSame person redoes it → TECH14-1, TECH14-2…\nA different person (e.g. from DEV) → TECH14-DEV1, TECH14-DEV2…\nSo you can always trace rework back to the original task.",
  },
  {
    category: "Tasks",
    question: "Can I attach files to a task?",
    answer:
      "Yes. Open the task and add attachments (documents, images, etc.). Both the assigner and the assigned person can see them.",
  },
  {
    category: "Tasks",
    question: "How do I find overdue tasks?",
    answer:
      "The Dashboard shows overdue counts, and in Tasks you can filter by status. A task whose end date has passed and is not completed is marked Overdue in red.",
  },

  /* ---------------- Review & Comments ---------------- */
  {
    category: "Review & Comments",
    question: "How do I send my task for review?",
    answer:
      "Change the task status to Review. A box opens where you write a short comment about what you did (required). The assigner gets a notification with your comment.",
  },
  {
    category: "Review & Comments",
    question: "How does the assigner review a task?",
    answer:
      "When a task is in Review, the assigner sees Approve and Rework buttons. The review box shows the task's details (ID, dates, priority, progress).\nApprove — give a score from 1 to 10 and an optional comment; the task becomes Completed.\nRework — write what needs to change (required); the task goes back to the assignee.",
  },
  {
    category: "Review & Comments",
    question: "Where can I see the review comment?",
    answer:
      "On the task card, in the Comments section. The assigned person also gets a notification (in-app, email and push/Telegram if connected) with the comment and score.",
  },
  {
    category: "Review & Comments",
    question: "Who can see and add comments on a task?",
    answer:
      "Both the person who assigned the task and the person it is assigned to. Open the Comments section on the task, type your message and send. The other person is notified.",
  },
  {
    category: "Review & Comments",
    question: "What is the review score used for?",
    answer:
      "The 1–10 score is saved with the task and shown in reports. Each person's average score, on-time count and number of reworks appear in the Individual Report.",
  },

  /* ---------------- Import ---------------- */
  {
    category: "Import",
    question: "How do I import tasks from a CSV / Excel file?",
    answer:
      "In Tasks, click Import, download the template, fill it in and upload it. You see a preview with any errors before the tasks are created.",
  },
  {
    category: "Import",
    question: "Which columns does the import template have?",
    answer:
      "Title, Start Date, Start Time, End Date, End Time, Department, Assignee, Status, Priority, Description.\nYou do not need a Task ID column — IDs are created automatically.",
  },
  {
    category: "Import",
    question: "What date formats can I use in the import?",
    answer:
      "Almost any: 2026-11-07, 07/11/2026, 7-11-2026, 7 Nov 2026, November 7 2026, Sat 7th Nov 2026, or an Excel date. Dates are read day-first (07/11 = 7 November). Times can be 17:00, 5pm, 5:30 PM or 0930.",
  },
  {
    category: "Import",
    question: "Why was a row rejected during import?",
    answer:
      "Common reasons: the title is empty, the date cannot be read, the start date is after the end date, or the assignee / department name does not match anyone in your organization. The preview shows the reason next to each row.",
  },

  /* ---------------- Task Bank & Calendar ---------------- */
  {
    category: "Task Bank & Calendar",
    question: "What is the Task Bank?",
    answer:
      "A library of reusable task templates. Save tasks you give often (daily reports, checks, etc.) and assign them later in a few clicks without retyping.",
  },
  {
    category: "Task Bank & Calendar",
    question: "What does the Task Calendar show?",
    answer:
      "All tasks placed on their dates, so you can see the workload per day, week or month. Click a task to open it.",
  },

  /* ---------------- Reports ---------------- */
  {
    category: "Reports",
    question: "What reports are available?",
    answer:
      "Reports shows team totals, monthly task progress and the Individual Report for each person.",
  },
  {
    category: "Reports",
    question: "What is in the Individual Report?",
    answer:
      "For each person: total, completed, pending and overdue tasks, average days to complete, on-time vs late, average score and reworks.\nOpen a person to see every task with its start date, deadline, submitted and completed dates, how many days it took, whether it was on time, score, subtasks, comments and the status history.",
  },
  {
    category: "Reports",
    question: "How is \"days taken\" calculated?",
    answer:
      "From the task's planned start (or when it was assigned, if that is later) until it was completed. Open tasks show how long they have been open instead.",
  },
  {
    category: "Reports",
    question: "Can I export a report?",
    answer:
      "Yes. Use Export on the Reports page for the whole team, or Export tasks inside a person's report for that person's task-wise CSV (opens in Excel).",
  },

  /* ---------------- Meetings & Chat ---------------- */
  {
    category: "Meetings & Chat",
    question: "What is MoM (Minutes of Meeting)?",
    answer:
      "A place to record meetings: attendees, discussion points and action plans. You can also start an Instant Meeting (built-in video call) and view meetings in list or calendar view.",
  },
  {
    category: "Meetings & Chat",
    question: "How do I chat with my team?",
    answer:
      "Open Chats and pick a person or group. You can send messages and files; new messages show a notification.",
  },

  /* ---------------- Notifications ---------------- */
  {
    category: "Notifications",
    question: "How will I know when I get a new task or comment?",
    answer:
      "You get an in-app notification (bell icon), an email, and — if enabled — a push notification and a Telegram message. This covers new tasks, status changes, review decisions and comments.",
  },
  {
    category: "Notifications",
    question: "How do I turn on push notifications?",
    answer:
      "Click Enable on the \"Turn on push notifications?\" prompt, or enable them in Settings. If you blocked them earlier, allow notifications for this site in your browser settings.",
  },
  {
    category: "Notifications",
    question: "How do I connect Telegram?",
    answer:
      "Go to Settings → Telegram and follow the steps to link your account. After that, task alerts are also sent to your Telegram.",
  },

  /* ---------------- Account & Users ---------------- */
  {
    category: "Account & Users",
    question: "How do I change my profile or password?",
    answer:
      "Open Settings → Profile to update your name, photo and other details, and change your password there.",
  },
  {
    category: "Account & Users",
    question: "How do I add or manage users?",
    answer:
      "Admins use the Users section to add people, set their role and department, edit or deactivate them.",
  },
  {
    category: "Account & Users",
    question: "I can't see a menu (e.g. Users or Reports). Why?",
    answer:
      "Menus depend on your role's permissions. Ask your admin to give your role access in Settings → Roles.",
  },
  {
    category: "Account & Users",
    question: "My question isn't answered here. What should I do?",
    answer:
      "Raise a support ticket below with the subject, category and details. You can follow the conversation on your ticket in My Tickets.",
  },
];

export default FAQS;
