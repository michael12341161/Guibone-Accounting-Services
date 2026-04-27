import {
  Award,
  Building2,
  CalendarCheck,
  CalendarDays,
  Clock3,
  FileText,
  LayoutDashboard,
  ListChecks,
  MessageCircleMore,
  ReceiptText,
} from "lucide-react";

export const clientBreadcrumbConfig = {
  basePath: "/client",
  hiddenPaths: ["/client"],
  separator: ">",
  exactPaths: {
    "/client": { label: "Dashboard", icon: LayoutDashboard },
    "/client/appointment": { label: "Appointment", icon: CalendarCheck },
    "/client/businesses": { label: "Business", icon: Building2 },
    "/client/documents": { label: "Documents", icon: FileText },
    "/client/payment": {
      label: "Payment",
      icon: ReceiptText,
      trailingItems: [
        {
          label: "Payment History",
          path: "/client/payment/history",
          icon: Clock3,
        },
      ],
    },
    "/client/payment/history": { label: "Payment History", icon: Clock3 },
    "/client/certificate": { label: "My Certificate", icon: Award },
    "/client/calendar": { label: "Calendar", icon: CalendarDays },
    "/client/messaging": { label: "Messaging", icon: MessageCircleMore },
    "/client/work-progress": {
      label: "Work Progress",
      icon: ListChecks,
      trailingItems: [
        {
          label: "History",
          path: "/client/work-progress/history",
          icon: Clock3,
          accessKey: "client-work-progress",
        },
      ],
    },
    "/client/work-progress/history": { label: "History", icon: Clock3 },
  },
  segmentLabels: {
    client: { label: "Dashboard", icon: LayoutDashboard },
    create: "Create",
    details: "Details",
    edit: "Edit",
    view: "View",
  },
  dynamicRoutes: [],
};

export default clientBreadcrumbConfig;
