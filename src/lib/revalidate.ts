import { env } from "../env.js";

/**
 * Tells the site to rebuild the pages an edit touched.
 *
 * This is the entire coupling between the two projects. The API knows one URL
 * and one shared secret; it does not know what Next.js is, and the site does
 * not know what the API is made of.
 *
 * Failure is logged, never thrown. If the site is unreachable the edit is
 * already saved — the page will pick it up on the next deploy, and an admin
 * save should not fail because a webhook did.
 */
export async function revalidate(paths: string[]): Promise<void> {
  if (!env.SITE_URL || !env.REVALIDATE_SECRET) {
    console.info("[revalidate] skipped — SITE_URL not configured yet");
    return;
  }

  try {
    const response = await fetch(`${env.SITE_URL}/api/revalidate`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-revalidate-secret": env.REVALIDATE_SECRET,
      },
      body: JSON.stringify({ paths }),
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      console.warn(`[revalidate] site replied ${response.status}`);
      return;
    }

    console.info(`[revalidate] ${paths.join(", ")}`);
  } catch (error) {
    console.warn("[revalidate] could not reach the site:", error);
  }
}

/** Every page that renders database content. */
export const ALL_PATHS = [
  "/",
  "/services",
  "/work",
  "/pricing",
  "/about",
  "/contact",
];