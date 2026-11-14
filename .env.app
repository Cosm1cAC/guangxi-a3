# 安卓应用构建（vite build --mode app）时写入的默认服务端地址；应用内可在登录窗口更改。
VITE_API_BASE=https://a3.vibelink.cloud/api
# 固定入口：返回当前牌桌地址（国内穿透的地址每次启动可能变化）。应用优先用它给的地址，问不到再用上面的默认地址。
VITE_ENTRY_URL=https://a3.vibelink.cloud/go/target.json
