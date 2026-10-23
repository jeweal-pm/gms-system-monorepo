import { createElement, type ComponentProps } from "react";
import { renderToString } from "react-dom/server";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { authTrpc, authTrpcContext, createAuthTrpcClient } from "../../src/lib/auth-trpc";
import { masterTrpc, masterTrpcContext, createMasterTrpcClient } from "../../src/lib/master-trpc";

describe("domain tRPC React contexts", () => {
  it("creates independent contexts for auth and master clients", () => {
    expect(authTrpcContext).not.toBe(masterTrpcContext);
  });

  it("keeps each nested provider bound to its own client", () => {
    const queryClient = new QueryClient();
    const authClient = createAuthTrpcClient();
    const masterClient = createMasterTrpcClient();

    function ClientContextProbe() {
      const authContext = authTrpc.useContext();
      const masterContext = masterTrpc.useContext();
      return createElement("output", {
        "data-auth-and-master-clients-separated": String(!Object.is(authContext.client, masterContext.client)),
        "data-auth-client-present": String(Boolean(authContext.client)),
        "data-master-client-present": String(Boolean(masterContext.client)),
      });
    }

    const authProviderProps = { client: authClient, queryClient } as ComponentProps<typeof authTrpc.Provider>;
    const masterProviderProps = { client: masterClient, queryClient } as ComponentProps<typeof masterTrpc.Provider>;
    const markup = renderToString(
      createElement(
        authTrpc.Provider,
        authProviderProps,
        createElement(masterTrpc.Provider, masterProviderProps, createElement(ClientContextProbe)),
      ),
    );

    expect(markup).toContain('data-auth-and-master-clients-separated="true"');
    expect(markup).toContain('data-auth-client-present="true"');
    expect(markup).toContain('data-master-client-present="true"');
  });
});
