import {
  BarChart3,
  Building2,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  ClipboardList,
  Clock3,
  FilePenLine,
  FileText,
  LayoutDashboard,
  ListTodo,
  MessageCircleMore,
  PencilLine,
  Settings,
  ShieldCheck,
  UserCog,
  UserPlus,
  UserRound,
  Users,
} from "lucide-react";

export const accountantBreadcrumbConfig = {
  basePath: "/accountant",
  hiddenPaths: ["/accountant"],
  separator: ">",
  exactPaths: {
    "/accountant": { label: "Dashboard", icon: LayoutDashboard },
    "/accountant/appointments": { label: "Appointments", icon: CalendarCheck },
    "/accountant/calendar": { label: "Calendar", icon: CalendarDays },
    "/accountant/client-management": { label: "Client Management", icon: Users },
    "/accountant/certificate": { label: "Certificate", icon: FilePenLine },
    "/accountant/certificate/edit": { label: "Edit Certificate", icon: PencilLine },
    "/accountant/documents": { label: "Documents", icon: FileText },
    "/accountant/business-status": { label: "Business Status", icon: Building2 },
    "/accountant/messaging": { label: "Messaging", icon: MessageCircleMore },
    "/accountant/new-client-management": { label: "New Client", icon: UserPlus },
    "/accountant/permissions": { label: "Permissions", icon: ShieldCheck },
    "/accountant/reports": { label: "Reports", icon: BarChart3 },
    "/accountant/scheduling": { label: "Consultation", icon: CalendarClock },
    "/accountant/settings": { label: "Settings", icon: Settings },
    "/accountant/tasks": {
      label: "Task Management",
      icon: ClipboardList,
      trailingItems: [
        {
          label: "Client Appointments",
          path: "/accountant/tasks/client-appointments",
          icon: CalendarCheck,
          accessKey: "tasks",
          actionKey: "client-appointments",
        },
      ],
    },
    "/accountant/tasks/client-appointments": {
      label: "Client Appointments",
      icon: CalendarCheck,
    },
    "/accountant/users": { label: "Users", icon: UserCog },
    "/accountant/work-update": {
      label: "My Tasks",
      icon: ListTodo,
      trailingItems: [
        {
          label: "History",
          path: "/accountant/work-update/history",
          icon: Clock3,
          accessKey: "work-update",
          actionKey: "history",
        },
      ],
    },
    "/accountant/work-update/history": { label: "History", icon: Clock3 },
  },
  segmentLabels: {
    accountant: { label: "Dashboard", icon: LayoutDashboard },
    create: "Create",
    details: "Details",
    edit: { label: "Edit User", icon: PencilLine },
    users: { label: "Users", icon: Users },
    view: "View",
  },
  dynamicRoutes: [
    {
      pattern: "/accountant/users/:userId",
      label: "User Details",
      icon: UserRound,
    },
    {
      pattern: "/accountant/users/:userId/edit",
      label: "Edit User",
      icon: PencilLine,
    },
  ],
};

export default accountantBreadcrumbConfig;
