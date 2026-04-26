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
  ListTodo,
  LayoutDashboard,
  MessageCircleMore,
  PencilLine,
  PlusSquare,
  ReceiptText,
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
    "/admin/client-management": {
      label: "Client Management",
      icon: Users,
      trailingItems: [
        {
          label: "Inactive User",
          path: "/admin/client-management/inactive-users",
          icon: Users,
          accessKey: "client-management",
        },
      ],
    },
    "/admin/client-management/inactive-users": { label: "Inactive User", icon: Users },
    "/admin/certificate": { label: "Certificate", icon: FilePenLine },
    "/admin/certificate/edit": { label: "Edit Certificate", icon: PencilLine, skipParentSegments: ["/admin/certificate"] },
    "/admin/documents": { label: "Documents", icon: FileText },
    "/admin/business-status": { label: "Business Status", icon: Building2 },
    "/admin/messaging": { label: "Messaging", icon: MessageCircleMore },
    "/admin/new-client-management": { label: "New Client", icon: UserPlus },
    "/admin/payment": { label: "Payment", icon: ReceiptText },
    "/admin/new-role": { label: "New Role", icon: PlusSquare },
    "/admin/permissions": { label: "Permissions", icon: ShieldCheck },
    "/admin/reports": { label: "Reports", icon: BarChart3 },
    "/admin/scheduling": { label: "Consultation", icon: CalendarClock },
    "/admin/settings": { label: "Settings", icon: Settings },
    "/admin/new-specialization": { label: "New Specialization", icon: PlusSquare },
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
    "/admin/tasks/client-appointments": {
      label: "Client Appointments",
      icon: CalendarCheck,
    },
    "/admin/new-services": { label: "New Services", icon: PlusSquare },
    "/admin/users": {
      label: "User Management",
      icon: UserCog,
      trailingItems: [
        {
          label: "Inactive User",
          path: "/admin/users/inactive-users",
          icon: Users,
          accessKey: "user-management",
        },
      ],
    },
    "/admin/users/inactive-users": { label: "Inactive User", icon: Users },
    "/admin/work-update": {
      label: "My Tasks",
      icon: ListTodo,
      trailingItems: [
        {
          label: "History",
          path: "/admin/work-update/history",
          icon: Clock3,
          accessKey: "work-update",
          actionKey: "history",
        },
      ],
    },
    "/admin/work-update/history": { label: "History", icon: Clock3 },
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
