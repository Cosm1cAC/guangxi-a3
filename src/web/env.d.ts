// Vite 注入的构建变量（只声明用到的）。
interface ImportMetaEnv { readonly VITE_API_BASE?: string; readonly VITE_ENTRY_URL?: string }
interface ImportMeta { readonly env: ImportMetaEnv }
