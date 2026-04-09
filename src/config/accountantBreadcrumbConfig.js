import {
  CalendarDays,
  Clock3,
  LayoutDashboard,
  ListTodo,
  MessageCircleMore,
  Settings,
} from "lucide-react";

export const accountantBreadcrumbConfig = {
  basePath: "/accountant",
  hiddenPaths: ["/accountant"],
  separator: ">",
  exactPaths: {
    "/accountant": { label: "Dashboard", icon: LayoutDashboard },
    "/accountant/calendar": { label: "Calendar", icon: CalendarDays },
    "/accountant/messaging": { label: "Messaging", icon: MessageCircleMore },
    "/accountant/my-tasks": {
      label: "My Tasks",
      icon: ListTodo,
      trailingItems: [
        {
          label: "History",
          path: "/accountant/my-tasks/history",
          icon: Clock3,
          accessKey: "work-update",
          actionKey: "history",
        },
      ],
    },
    "/accountant/my-tasks/history": { label: "History", icon: Clock3 },
    "/accountant/settings": { label: "Settings", icon: Settings },
  },
  segmentLabels: {
    accountant: { label: "Dashboard", icon: LayoutDashboard },
    create: "Create",
    details: "Details",
    edit: "Edit",
    view: "View",
  },
  dynamicRoutes: [],
};

export default accountantBreadcrumbConfig;
