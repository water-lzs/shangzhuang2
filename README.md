# 穿越京西稻 · 四时御田 — GitHub Pages 部署包

## 这是「平铺包」，整包上传即可

把本目录里的**全部文件**（不是文件夹）直接拖到 GitHub 仓库根目录，保证 `index.html`
就在仓库根目录。不要只上传 HTML 或 ZIP，也不要在仓库里再套一层子目录。

```
仓库/
├─ index.html          ← 必须在这一层
├─ app.js
├─ *.js / *.css
├─ *.glb               ← 四季模型（原始未压缩）
├─ three.module.js     ← three.js r186（官方原版）
├─ three.core.js
├─ GLTFLoader.js 等 addon
├─ manifest.json  alignment.json  town-map.jpg  shangzhuang.jpg
├─ v-*.jpg  p-*.jpg  s-*.jpg      ← 图鉴与作坊配图（24 张，根级）
└─ .nojekyll
```

## 发布

```
Settings → Pages → Source: Deploy from a branch
Branch: main    Folder: /(root)    → Save
```

等一两分钟，打开 Pages 给出的网址即可。

## 注意

- 本目录**全部是根级文件，没有子目录**。因为 GitHub 网页端上传会自动拍平目录，
  所以这份代码里的相对路径已经全部按根级写死（`./three.module.js`、`./JingXi_Aligned_Spring.glb` …）。
  千万不要手动把它们塞回 `vendor/`、`models/`、`assets/` 子目录，否则又会白屏。
- 直接用浏览器双击打开 `index.html` 不可靠（`file://` 下 ES Module 与 fetch 会被拦）。
  本地预览请起一个静态服务，例如在本目录执行 `python -m http.server 8000`。
- 存档在浏览器 localStorage，换域名/清缓存会丢。
- 社交认养是本地模拟；真实多人互动与寄米尚未接入后端。

## 体积

四季 GLB 与 three.js 均为**原始未压缩版本**：量化/简化会把树冠叶片削没、并与静态合批
冲突（2026-10-06 实测后拍板撤销，美术资源优先于体积）。
模型**按季懒加载**：首屏只解析当前季，其余季在空闲时预取，进入时再解析；
内存里最多保留 3 季，更早的会自动释放显存。
