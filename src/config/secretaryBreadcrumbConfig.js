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
  UserCog,
  UserPlus,
  Users,
} from "lucide-react";

export const secretaryBreadcrumbConfig = {
  basePath: "/secretary",
  hiddenPaths: ["/secretary"],
  separator: ">",
  exactPaths: {
    "/secretary": { label: "Dashboard", icon: LayoutDashboard },
    "/secretary/appointments": { label: "Appointments", icon: CalendarCheck },
    "/secretary/business-status": { label: "Business Status", icon: Building2 },
    "/secretary/calendar": { label: "Calendar", icon: CalendarDays },
    "/secretary/client-management": { label: "Client Management", icon: Users },
    "/secretary/certificate": { label: "Certificate", icon: FilePenLine },
    "/secretary/certificate/edit": { label: "Edit Certificate", icon: PencilLine },
    "/secretary/documents": { label: "Documents", icon: FileText },
    "/secretary/messaging": { label: "Messaging", icon: MessageCircleMore },
    "/secretary/new-client-management": { label: "New Client", icon: UserPlus },
    "/secretary/reports": { label: "Reports", icon: BarChart3, accessKey: "reports" },
    "/secretary/scheduling": { label: "Consultation", icon: CalendarClock },
    "/secretary/tasks": {
      label: "Task Management",
      icon: ClipboardList,
      trailingItems: [
        {
          label: "Client Appointments",
          path: "/secretary/tasks/client-appointments",
          icon: CalendarCheck,
          accessKey: "tasks",
          actionKey: "client-appointments",
        },
      ],
    },
    "/secretary/tasks/client-appointments": {
      label: "Client Appointments",
      icon: CalendarCheck,
    },
    "/secretary/users": { label: "Users", icon: UserCog },
    "/secretary/work-update": {
      label: "My Tasks",
      icon: ListTodo,
      trailingItems: [
        {
          label: "History",
          path: "/secretary/work-update/history",
          icon: Clock3,
          accessKey: "work-update",
          actionKey: "history",
        },
      ],
    },
    "/secretary/work-update/history": { label: "History", icon: Clock3 },
  },
  segmentLabels: {
    secretary: { label: "Dashboard", icon: LayoutDashboard },
    create: "Create",
    details: "Details",
    edit: "Edit",
    view: "View",
  },
  dynamicRoutes: [],
};

export default secretaryBreadcrumbConfig;
