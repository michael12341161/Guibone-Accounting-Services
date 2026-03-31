import {
  BarChart3,
  Building2,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  ClipboardList,
  FilePenLine,
  FileText,
  LayoutDashboard,
  MessageCircleMore,
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
    "/secretary/documents": { label: "Documents", icon: FileText },
    "/secretary/messaging": { label: "Messaging", icon: MessageCircleMore },
    "/secretary/new-client-management": { label: "New Client", icon: UserPlus },
    "/secretary/reports": { label: "Reports", icon: BarChart3 },
    "/secretary/scheduling": { label: "Consultation", icon: CalendarClock },
    "/secretary/tasks": {
      label: "Task Management",
      icon: ClipboardList,
      trailingItems: [
        {
          label: "Client Appointments",
          path: "/secretary/tasks/client-appointments",
          icon: CalendarCheck,
        },
      ],
    },
    "/secretary/tasks/client-appointments": { label: "Client Appointments", icon: CalendarCheck },
    "/secretary/users": { label: "Users", icon: UserCog },
    "/secretary/work-update": { label: "Task Updates", icon: FilePenLine },
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
