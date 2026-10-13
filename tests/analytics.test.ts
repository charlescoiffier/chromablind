import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

describe("statistiques de visite (Umami)", () => {
  it("la balise est présente, limitée à chromablind.charlescoiffier.fr et respecte Do Not Track", () => {
    const tag = html.match(/<script[^>]*src="https:\/\/stats\.charlescoiffier\.fr\/script\.js"[^>]*>/);
    expect(tag).not.toBeNull();
    expect(tag![0]).toMatch(/\bdefer\b/);
    expect(tag![0]).toContain('data-website-id="1ed7436b-e073-4288-91fc-e76c4dfff323"');
    expect(tag![0]).toContain('data-domains="chromablind.charlescoiffier.fr"');
    expect(tag![0]).toContain('data-do-not-track="true"');
  });

  it("la politique de sécurité autorise le domaine des statistiques, et lui seul en plus de 'self'", () => {
    const nginx = readFileSync(new URL("../deploy/nginx.conf", import.meta.url), "utf8");
    const csp = nginx.match(/Content-Security-Policy "([^"]+)"/)![1];
    const directive = (name: string) => csp.split(";").map((d) => d.trim()).find((d) => d.startsWith(name + " "))!;
    expect(directive("script-src")).toBe("script-src 'self' https://stats.charlescoiffier.fr");
    expect(directive("connect-src")).toBe("connect-src 'self' https://stats.charlescoiffier.fr");
    expect(directive("default-src")).toBe("default-src 'self'");
  });
});
