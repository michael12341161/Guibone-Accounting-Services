export function getClientId(client) {
  return String(
    client?.client_id ??
      client?.Client_ID ??
      client?.clientId ??
      client?.clientID ??
      client?.id ??
      ""
  ).trim();
}

export function matchesClientId(client, clientId) {
  const target = String(clientId ?? "").trim();
  return Boolean(target) && getClientId(client) === target;
}

export function findClientById(clients, clientId) {
  return (
    (Array.isArray(clients) ? clients : []).find((client) =>
      matchesClientId(client, clientId)
    ) || null
  );
}
