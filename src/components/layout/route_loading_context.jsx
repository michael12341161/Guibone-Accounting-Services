import { createContext, useContext } from "react";

export const RouteLoadingContext = createContext({
  routeLoading: false,
  startRouteLoading: () => {},
});

export function useRouteLoading() {
  return useContext(RouteLoadingContext);
}
