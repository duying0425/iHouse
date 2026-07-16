# iHouse 服务器部署手册

> 适用版本：v3（含 AI 图片识别）
> 最后更新：2026-07-16
> 推荐方式：Docker Compose，从本地源码构建

本文覆盖 Linux 服务器、家庭 NAS 和 Synology Container Manager 的首次部署、AI 配置、HTTPS、升级、备份恢复与排障。项目根目录的 `docker-compose.yml` 是唯一推荐的生产编排入口。

## 1. 部署前检查

服务器至少需要：

- Docker Engine 与 Docker Compose v2（命令为 `docker compose`）。
- 能访问代码仓库和 npm/pnpm 软件源，以便首次构建镜像。
- 可写的持久化目录 `./server/data`。
- 对外开放一个访问端口；默认是宿主机 `8180`。
- 若启用 AI 识别，服务器需要能通过 HTTPS 访问所配置的 AI API。

建议为正式环境准备域名和 HTTPS。移动端拍照、剪贴板访问和登录信息传输在 HTTPS 下更可靠、更安全。

## 2. 获取代码与配置环境变量

```bash
git clone https://github.com/duying0425/iHouse.git
cd iHouse
cp .env.example .env
chmod 600 .env
```

编辑 `.env`：

```env
# 填服务根地址，程序自动补全 /v1/chat/completions
AI_API_BASE_URL=https://your-ai-api.example.com
AI_API_KEY=replace-with-your-api-key
AI_MODEL=openai/gpt-5.6-sol
AI_TIMEOUT_MS=60000

# 如果供应商只提供完整地址，可改用下列配置；它优先于 BASE_URL
# AI_API_URL=https://your-ai-api.example.com/v1/chat/completions
```

配置规则：

- `AI_API_BASE_URL` 必须包含 `http://` 或 `https://`。可填域名根地址、以 `/v1` 结尾的地址，后端会补全 Chat Completions 路径。
- `AI_API_URL` 用于直接填写完整 `/v1/chat/completions` 地址；两者同时存在时它优先。
- `AI_API_KEY` 只由 Node.js 后端读取，禁止使用 `VITE_` 前缀。
- `AI_MODEL` 默认 `openai/gpt-5.6-sol`，必须是支持图片输入的模型。
- 未配置 AI 变量时，除“AI 识别”外的全部功能仍可正常使用。
- `.env` 已被 Git 和 Docker 构建上下文忽略；Compose 只把明确列出的变量注入运行容器。

不要把 `docker compose config` 的完整输出发到公开渠道，因为展开后的内容会包含 Key。只校验语法可运行：

```bash
docker compose config --quiet
```

## 3. 首次启动

```bash
mkdir -p server/data
docker compose up -d --build
docker compose ps
```

首次构建会编译前端和 `better-sqlite3`，通常比后续更新更久。默认访问地址：

```text
http://<服务器IP>:8180
```

验证服务：

```bash
curl -fsS http://127.0.0.1:8180/api/health
docker inspect --format '{{.State.Health.Status}}' ihouse
docker compose logs --tail=100 ihouse
```

健康接口应返回：

```json
{"ok":true}
```

首次打开网页后注册账户并创建房屋。若挂载的是旧版单用户数据库，服务会自动迁移到新建的 `admin` 账户，临时密码会写入首次启动日志；登录后应立即修改密码。

## 4. 验证 AI 图片识别

1. 登录 iHouse，进入任意区域并录入物品。
2. 拍照或上传主图，等待图片预览出现。
3. 点击“AI 识别”。
4. 核对名称、分类、品牌、标签、规格、价格与备注，然后保存。

识别只填空字段，不覆盖用户已经输入的内容。价格是模型给出区间的中值，原始区间会写入空白备注。点击识别时，该主图会由 iHouse 后端转成图片数据并发送到配置的 AI 上游；未点击时不会发送。

常见错误：

| 页面提示 | 排查方向 |
|---|---|
| AI 识别尚未配置 | 检查 `.env` 是否与 `docker-compose.yml` 同目录，然后执行 `docker compose up -d --force-recreate` |
| AI 服务鉴权失败 | 检查 Key 是否有效、是否有模型权限 |
| AI 服务暂时不可用 / 请求过于频繁 | 检查上游状态、额度、并发或限流 |
| AI 识别超时 | 确认服务器能访问上游；必要时提高 `AI_TIMEOUT_MS`，上限 120000 |
| 仅支持刚拍摄或上传的图片 | 外部图片 URL 需先下载并通过“上传图片”保存到本服务 |
| 没有识别到明确物品 | 使用主体更大、光线更好、背景更简单的照片重试 |

查看后端错误日志：

```bash
docker compose logs --tail=200 ihouse
```

服务端日志不会打印 Key，也不会把上游响应原文返回浏览器。

## 5. 端口、防火墙与 HTTPS

### 5.1 直接通过局域网访问

默认映射为 `8180:3000`。在服务器防火墙放行 TCP 8180，并访问 `http://<服务器IP>:8180`。不要修改容器内部端口 3000；若要换外部端口，只改冒号左侧，例如：

```yaml
ports:
  - "8280:3000"
```

### 5.2 Nginx 反向代理

如果只允许反向代理访问，可把 Compose 端口绑定改为 `127.0.0.1:8180:3000`，然后配置 Nginx：

```nginx
server {
    listen 443 ssl http2;
    server_name house.example.com;

    # ssl_certificate /path/to/fullchain.pem;
    # ssl_certificate_key /path/to/privkey.pem;

    client_max_body_size 256m;

    location / {
        proxy_pass http://127.0.0.1:8180;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 130s;
        proxy_send_timeout 130s;
    }
}
```

`client_max_body_size 256m` 用于完整 ZIP 备份导入；代理超时需高于最大 AI 超时。

### 5.3 Caddy 示例

```caddyfile
house.example.com {
    reverse_proxy 127.0.0.1:8180
}
```

Caddy 可自动申请和续期 HTTPS 证书。无论使用哪种代理，都应保证 `/api/*` 和前端页面转发到同一个 iHouse 服务，避免鉴权和图片地址跨域。

## 6. Synology NAS 部署

推荐通过 SSH 在 NAS 上执行与 Linux 相同的 Compose 流程：

```bash
cd /volume1/docker
git clone https://github.com/duying0425/iHouse.git ihouse
cd ihouse
cp .env.example .env
chmod 600 .env
# 编辑 .env
sudo docker compose up -d --build
```

若使用 Container Manager 图形界面：

1. 在 File Station 准备 `/volume1/docker/ihouse/`，上传完整仓库源码。
2. 在该目录放置 `.env`，并确认 `server/data/` 可写。
3. Container Manager → 项目 → 新增，选择该目录中的 `docker-compose.yml`。
4. 构建并启动项目，端口使用默认 8180 或按需修改。
5. 在“容器 → ihouse → 日志”检查启动情况。

不要只上传 `docker-compose.yml`：当前镜像由本地源码构建，需要 `Dockerfile`、前后端源码及锁文件一并存在。

## 7. 数据目录与备份策略

持久化目录为：

```text
server/data/
├── home.db          # SQLite：用户、会话、房屋、成员关系与房屋 JSON
├── home.db-wal      # 运行时可能存在
├── home.db-shm      # 运行时可能存在
└── images/          # 所有上传图片
```

重建或删除容器不会删除该宿主机目录，但 `docker compose down -v`、误删目录或磁盘损坏仍可能造成数据丢失。

### 7.1 单房屋日常备份

在“户型设置 → 数据维护”点击“导出 ZIP”。该备份包含当前房屋的 `home.json`、其引用的全部图片和 manifest，可在目标房屋中由管理员导入。它不包含用户账号、会话和房屋成员关系。

### 7.2 整个实例冷备份

需要保留所有账号、房屋、成员关系与图片时，备份整个 `server/data/`。为确保 SQLite、WAL 和图片处于一致状态，先停止容器：

```bash
docker compose stop ihouse
tar -czf "ihouse-data-$(date +%F-%H%M).tar.gz" server/data
docker compose start ihouse
```

同时单独安全保存 `.env`；不要把含密钥的 `.env` 放进公开或多人可读的备份。

### 7.3 恢复整个实例

```bash
docker compose down
mv server/data "server/data.before-restore-$(date +%F-%H%M)"
mkdir -p server/data
tar -xzf ihouse-data-YYYY-MM-DD-HHMM.tar.gz
docker compose up -d
```

恢复后检查 `server/data/home.db` 和 `server/data/images/` 路径没有多套一层目录，再执行健康检查并登录抽查图片。

建议至少保留“每日单房屋 ZIP + 定期整个实例冷备份”两层备份，并把副本放到另一块磁盘或另一台设备。

## 8. 更新与回滚

更新前先做整个实例冷备份，然后：

```bash
git status --short
git pull --ff-only
docker compose build --pull
docker compose up -d
docker compose ps
curl -fsS http://127.0.0.1:8180/api/health
```

若仓库有本地修改，先确认其用途，不要强制覆盖。`.env` 和 `server/data/` 已忽略，不会被 `git pull` 修改。

代码回滚示例：

```bash
git log --oneline -10
git checkout <已验证的提交或标签>
docker compose up -d --build
```

若新版本已改变或迁移数据，仅回滚代码可能不够，应同时恢复更新前的 `server/data/` 冷备份。恢复完成后再切回正常分支。

## 9. 运维命令

```bash
# 状态与健康
docker compose ps
curl -fsS http://127.0.0.1:8180/api/health

# 实时日志
docker compose logs -f --tail=200 ihouse

# 重启（配置未变化）
docker compose restart ihouse

# .env 或 compose 改变后重建容器配置
docker compose up -d --force-recreate

# 代码或依赖变化后重建镜像
docker compose up -d --build

# 查看数据占用
du -sh server/data server/data/images
```

## 10. 故障排查

### 容器反复重启

```bash
docker compose ps
docker compose logs --tail=300 ihouse
```

重点检查 `server/data` 权限、磁盘空间、3000 端口健康检查和 `better-sqlite3` 启动错误。

### 网页打不开但容器健康

- 检查宿主机 8180 端口、防火墙和云服务器安全组。
- 反向代理场景检查代理目标是否为 `127.0.0.1:8180`。
- 在服务器本机执行 `curl http://127.0.0.1:8180/api/health` 区分应用与网络问题。

### 上传或备份导入返回 413

应用本身允许最大 256MB，请同步提高 Nginx、CDN 或其他反向代理的请求体上限。

### 数据或图片未持久化

执行 `docker inspect ihouse`，确认 `/app/server/data` 正确挂载到宿主机仓库下的 `server/data`，并检查该目录可写。

### 修改 `.env` 后 AI 仍使用旧配置

`docker compose restart` 不会重新读取并替换已有容器的环境变量。请运行：

```bash
docker compose up -d --force-recreate
```

然后再次检查日志并测试识别。

## 11. 上线检查清单

- [ ] `.env` 已创建、权限已限制，真实 Key 未提交到 Git。
- [ ] `docker compose config --quiet` 通过。
- [ ] `server/data` 已挂载且有独立备份。
- [ ] 容器状态为 healthy，`/api/health` 返回 `{"ok":true}`。
- [ ] 已创建账户和房屋，管理员密码已妥善保存。
- [ ] 上传、图片访问、ZIP 导出和导入已抽样验证。
- [ ] AI 识别已用实际图片验证，识别结果经过人工核对。
- [ ] 公网访问已启用 HTTPS，防火墙只开放必要端口。
- [ ] 已记录升级、回滚和备份恢复负责人及路径。
