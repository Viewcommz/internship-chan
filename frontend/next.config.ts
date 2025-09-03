import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */

  // 도커 배포 시 권장
  output: "standalone",
};

export default nextConfig;
