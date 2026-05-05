export default async function handleWorkspaceLogout({ logout, navigate }) {
  const didLogout = await logout();
  if (!didLogout) {
    return false;
  }

  navigate("/login", { replace: true });
  return true;
}
