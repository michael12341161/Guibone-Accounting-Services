import React from "react";
import UserManagement from "./user_management";

export default function InactiveEmployee() {
  return (
    <UserManagement
      userStatusFilter="inactive"
      pageTitle="Inactive User"
      pageDescription="Review inactive employee accounts and reactivate them when needed."
      emptyMessage="No inactive users found."
      showAddUserButton={false}
    />
  );
}
