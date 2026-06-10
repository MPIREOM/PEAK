/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // NOTE: API body-size limits are configured per route via `export const config`
  // (see pages/api/whatsapp.js) — there is no valid top-level `api` option here.
};

module.exports = nextConfig;
