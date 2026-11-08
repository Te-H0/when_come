/// <reference types="vite/client" />

declare const __BUILD_ID__: string;

interface ImportMetaEnv {
  readonly VITE_NAVER_MAPS_CLIENT_ID?: string;
  readonly VITE_ENABLE_STOP_MAP?: string;
  readonly VITE_LOCAL_DEMO?: string;
}
