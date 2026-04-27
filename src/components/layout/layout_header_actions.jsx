import React from "react";
import BubbleChat from "../../bubble_chat/bubble_chat";
import NotificationBell from "../notification/NotificationBell";
import DarkModeToggle from "../darkmode/DarkModeToggle";

export function LayoutHeaderActions() {
  return (
    <>
      <DarkModeToggle showLabel={false} />
      <BubbleChat />
      <NotificationBell />
    </>
  );
}
