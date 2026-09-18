#!/usr/bin/env bash
# Fixflow 一键安装脚本（面向新手，全程中文提示）
set -e

echo ""
echo "==================== Fixflow 运维管家 一键安装 ===================="
echo ""

# 1) 检查 Node.js
if ! command -v node >/dev/null 2>&1; then
  echo "❌ 未检测到 Node.js（要求 ≥18）"
  echo ""
  echo "请先安装 Node.js，任选一种："
  echo "  · 一键安装（Ubuntu/Debian）："
  echo "      curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs"
  echo "  · 或使用 nvm（推荐，多版本管理）："
  echo "      curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash"
  echo "      重新登录后执行: nvm install 20"
  echo ""
  echo "安装完成后重新运行本脚本即可。"
  exit 1
fi

MAJOR=$(node -e "console.log(process.versions.node.split('.')[0])")
if [ "$MAJOR" -lt 18 ]; then
  echo "❌ Node.js 版本过低（当前 $(node -v)），要求 ≥18。请升级后重试。"
  exit 1
fi
echo "✅ Node.js $(node -v)"

# 2) 定位安装包
TGZ="${1:-$(pwd)/fixflow-0.1.0.tgz}"
if [ ! -f "$TGZ" ]; then
  echo "❌ 未找到安装包：$TGZ"
  echo "   请将 fixflow-0.1.0.tgz 放到当前目录，或作为参数指定路径："
  echo "   bash install.sh /path/to/fixflow-0.1.0.tgz"
  exit 1
fi

# 3. 安装
echo "正在安装 Fixflow…"
npm i -g "$TGZ"
echo "✅ 安装完成"
echo ""
echo "==================== 下一步：配置并启动 ===================="
echo "运行 fixflow 进入配置向导（选择服务商 → 粘贴 API Key → 选模型）。"
echo "按提示选择是否启动面板，选“是”后即可用浏览器访问面板。"
echo ""
echo "  普通用户：      fixflow"
echo "  只想装好再配置： fixflow"
echo "  自检服务：       fixflow doctor"
echo ""
echo "（也可用环境变量免交互：FIXFLOW_API_KEY=... FIXFLOW_BASE_URL=... FIXFLOW_MODEL=... npm i -g fixflow）"