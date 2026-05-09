import React from "react";
import { useLocation } from "react-router-dom";
import BubbleChat from "../../bubble_chat/bubble_chat";

export default function MessagingPage() {
  const location = useLocation();
  const initialPartnerId = Number(location.state?.initialPartnerId);
  const resolvedInitialPartnerId = Number.isFinite(initialPartnerId) && initialPartnerId > 0 ? initialPartnerId : null;

  return (
    <div className="mx-auto max-w-6xl">
      <BubbleChat
        key={resolvedInitialPartnerId || "default"}
        mode="embedded"
        className="min-h-[44rem]"
        conversationHeightClassName="h-[30rem]"
        initialPartnerId={resolvedInitialPartnerId}
      />
    </div>
  );
}
