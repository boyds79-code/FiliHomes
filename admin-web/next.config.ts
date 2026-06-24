import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Turbopack 경고를 잠재우기 위해 설정
  typescript: {
    ignoreBuildErrors: true, // 에러가 나더라도 개발을 계속하기 위해 (필요시)
  },
  turbopack: {
    root: path.join(__dirname, "."),
  },
};

export default nextConfig;