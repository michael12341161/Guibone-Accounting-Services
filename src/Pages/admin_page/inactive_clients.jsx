import React from "react";
import ClientManagement from "./client_management";

export default function InactiveClients() {
  return (
    <ClientManagement
      clientStatusFilter="inactive"
      pageTitle="Inactive User"
      pageDescription="Review inactive client accounts and reactivate them when needed."
      emptyMessage="No inactive clients found."
      showAddClientButton={false}
    />
  );
}
