import { sha256 } from "@noble/hashes/sha256";
import { randomBytes } from "@noble/hashes/utils";
import { base64, base64urlnopad, hex } from "@scure/base";
import { unixNow } from "@snort/shared";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { v4 as uuid } from "uuid";

import PageSpinner from "@/Components/PageSpinner";
import { WalletConfig, WalletKind, Wallets } from "@/Wallet";
import AlbyWallet from "@/Wallet/AlbyWallet";

export default function AlbyOAuth() {
  const navigate = useNavigate();
  const location = useLocation();
  const alby = getAlbyOAuth();
  const [error, setError] = useState("");

  async function setupWallet(token: string) {
    try {
      const auth = await alby.getToken(token);
      console.debug(auth);
      const connection = new AlbyWallet(auth, () => {});
      const info = await connection.getInfo();

      const newWallet = {
        id: uuid(),
        kind: WalletKind.Alby,
        active: true,
        info,
        data: JSON.stringify(auth),
      } as WalletConfig;
      Wallets.add(newWallet);

      navigate("/settings/wallet");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    if (location.search) {
      const params = new URLSearchParams(location.search);
      const token = params.get("code");
      if (token) {
        setupWallet(token).catch(e => {
          setError((e as Error).message);
        });
      }
    }
  }, [location]);

  if (!location.search) return;
  return (
    <>
      <h1>Alby Wallet Connection</h1>
      {!error && <PageSpinner />}
      {error && <b className="warning">{error}</b>}
    </>
  );
}

export function getAlbyOAuth() {
  const clientId = CONFIG.alby?.clientId ?? "";
  const clientSecret = CONFIG.alby?.clientSecret ?? "";
  const redirectUrl = `${window.location.protocol}//${window.location.host}/settings/wallet/alby`;
  const scopes = ["invoices:create", "invoices:read", "transactions:read", "balance:read", "payments:send"];

  const ec = new TextEncoder();
  const tokenUrl = "https://api.getalby.com/oauth/token";

  return {
    tokenUrl,
    getAuthUrl: () => {
      const code_verifier = hex.encode(randomBytes(64));
      window.sessionStorage.setItem("alby-code", code_verifier);

      const params = new URLSearchParams();
      params.set("client_id", clientId);
      params.set("response_type", "code");
      params.set("code_challenge", base64urlnopad.encode(sha256(code_verifier)));
      params.set("code_challenge_method", "S256");
      params.set("redirect_uri", redirectUrl);
      params.set("scope", scopes.join(" "));

      return `https://getalby.com/oauth?${params}`;
    },
    getToken: async (token: string) => {
      const code = window.sessionStorage.getItem("alby-code");
      if (!code) throw new Error("Alby code is missing!");
      window.sessionStorage.removeItem("alby-code");

      const form = new URLSearchParams();
      form.set("client_id", clientId);
      form.set("code_verifier", code);
      form.set("grant_type", "authorization_code");
      form.set("redirect_uri", redirectUrl);
      form.set("code", token);

      const req = await fetch(tokenUrl, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/x-www-form-urlencoded",
          authorization: `Basic ${base64.encode(ec.encode(`${clientId}:${clientSecret}`))}`,
        },
        body: form,
      });

      const data = await req.json();
      if (req.ok) {
        return { ...data, created_at: unixNow() } as OAuthToken;
      } else {
        throw new Error(data.error_description as string);
      }
    },
  };
}

export interface OAuthToken {
  access_token: string;
  created_at: number;
  expires_in: number;
  refresh_token: string;
  scope: string;
  token_type: string;
}
