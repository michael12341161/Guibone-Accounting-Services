import {
  Building2,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  ClipboardList,
  FilePenLine,
  FileText,
  LayoutDashboard,
  MessageCircleMore,
  PencilLine,
  Settings,
  ShieldCheck,
  UserCog,
  UserPlus,
  UserRound,
  Users,
} from "lucide-react";

export const adminBreadcrumbConfig = {
  basePath: "/admin",
  hiddenPaths: ["/admin"],
  separator: ">",
  exactPaths: {
    "/admin": { label: "Dashboard", icon: LayoutDashboard },
    "/admin/appointments": { label: "Appointments", icon: CalendarCheck },
    "/admin/calendar": { label: "Calendar", icon: CalendarDays },
    "/admin/client-management": { label: "Client Management", icon: Users },
    "/admin/documents": { label: "Documents", icon: FileText },
    "/admin/business-status": { label: "Business Status", icon: Building2 },
    "/admin/messaging": { label: "Messaging", icon: MessageCircleMore },
    "/admin/new-client-management": { label: "New Client", icon: UserPlus },
    "/admin/permissions": { label: "Permissions", icon: ShieldCheck },
    "/admin/scheduling": { label: "Consultation", icon: CalendarClock },
    "/admin/settings": { label: "Settings", icon: Settings },
    "/admin/tasks": {
      label: "Task Management",
      icon: ClipboardList,
      trailingItems: [
        {
          label: "Client Appointments",
          path: "/admin/tasks/client-appointments",
          icon: CalendarCheck,
          accessKey: "tasks",
          actionKey: "client-appointments",
        },
      ],
    },
    "/admin/tasks/client-appointments": { label: "Client Appointments", icon: CalendarCheck },
    "/admin/users": { label: "Users", icon: UserCog },
    "/admin/work-update": { label: "Task Updates", icon: FilePenLine },
  },
  segmentLabels: {
    admin: { label: "Dashboard", icon: LayoutDashboard },
    create: "Create",
    details: "Details",
    edit: { label: "Edit User", icon: PencilLine },
    users: { label: "Users", icon: Users },
    view: "View",
  },
  // Add future parameterized routes here to keep labels in one place.
  dynamicRoutes: [
    {
      pattern: "/admin/users/:userId",
      label: "User Details",
      icon: UserRound,
    },
    {
      pattern: "/admin/users/:userId/edit",
      label: "Edit User",
      icon: PencilLine,
    },
  ],
};

export default adminBreadcrumbConfig;
