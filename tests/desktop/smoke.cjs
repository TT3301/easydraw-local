const path = require("node:path");
const fs = require("node:fs/promises");
const { app } = require("electron");

exports.runDesktopSmoke = async ({ mainWindow, smokeUserData, isolatedLiveSmokeMode }) => {
    if (
      process.env.EASYDRAW_SMOKE_TEST !== "1" &&
      !isolatedLiveSmokeMode
    ) {
      return;
    }
    try {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await mainWindow.webContents.executeJavaScript(`
        (async () => {
          document.querySelector('[data-start-action="new-project"]')?.click();
          const deadline = Date.now() + 4000;
          while (
            !document.querySelector(".app-shell") &&
            Date.now() < deadline
          ) {
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
        })()
      `);
      const localOnly = await mainWindow.webContents.executeJavaScript(`
        !document.querySelector(".share-status-control, .share-dialog, .account-dialog") &&
        !Object.keys(window.easydrawDesktop || {}).some(name => /share|account|registration|password/i.test(name))
      `);
      if (!localOnly) throw new Error("Local-only desktop must not expose cloud UI or APIs");
      if (isolatedLiveSmokeMode) {
        const ready = await mainWindow.webContents.executeJavaScript(`Boolean(document.querySelector(".app-shell"))`);
        if (!ready) throw new Error("Desktop startup did not reach the workbench");
        if (process.env.EASYDRAW_MCP_SMOKE === "1") {
          await require("./mcp-integration-smoke.cjs").run(mainWindow, smokeUserData);
        } else {
          // Explicit test-only authorization inside this isolated desktop instance.
          await mainWindow.webContents.executeJavaScript(`window.easydrawDesktop.setMcpEnabled(true)`);
          if (process.env.EASYDRAW_MULTI_CANVAS_SMOKE === "1") await require("./multi-canvas-smoke.cjs").run(mainWindow, smokeUserData);
        }
        return;
      }
      if (process.env.EASYDRAW_CAPTURE_MCP) {
        const target = path.resolve(process.env.EASYDRAW_CAPTURE_MCP);
        await fs.mkdir(path.dirname(target), { recursive: true });
        const panelBounds =
          await mainWindow.webContents.executeJavaScript(`
            (() => {
              const box = document.querySelector(".right-panel")
                ?.getBoundingClientRect();
              return box
                ? {
                    x: Math.round(box.x),
                    y: Math.round(box.y),
                    width: Math.round(box.width),
                    height: Math.round(box.height)
                  }
                : null;
            })()
          `);
        const screenshot = panelBounds
          ? await mainWindow.webContents.capturePage(panelBounds)
          : await mainWindow.webContents.capturePage();
        await fs.writeFile(target, screenshot.toPNG());
      }
      await mainWindow.webContents.executeJavaScript(`
        document.querySelector('[aria-label="展开左侧边栏"]')?.click()
      `);
      await new Promise((resolve) => setTimeout(resolve, 120));
      const smokeAssetPath = path.join(smokeUserData, "reference.png");
      await fs.mkdir(path.dirname(smokeAssetPath), { recursive: true });
      await fs.writeFile(
        smokeAssetPath,
        Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
          "base64",
        ),
      );
      const smokeSvgPath = path.join(smokeUserData, "reference.svg");
      await fs.writeFile(
        smokeSvgPath,
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 32"><rect width="48" height="32" fill="#5b8def"/></svg>',
        "utf8",
      );
      const result = await mainWindow.webContents.executeJavaScript(`
        (async () => ({
          title: document.title,
          hasAppShell: Boolean(document.querySelector(".app-shell")),
          hasDesktopApi: Boolean(window.easydrawDesktop),
          projectRoundTrip: await (async () => {
            const opened = await window.easydrawDesktop?.openProject();
            await window.easydrawDesktop?.saveProject({
              projectPath: opened.projectPath,
              document: { ...opened.document, revision: 0 }
            });
            const reopened = await window.easydrawDesktop?.openProject();
            return reopened?.document?.revision;
          })(),
          assetRoundTrip: await (async () => {
            const opened = await window.easydrawDesktop?.openProject();
            const inserted = await window.easydrawDesktop?.importAsset({
              projectPath: opened.projectPath,
              sourcePath: ${JSON.stringify(smokeAssetPath)}
            });
            const asset = inserted.asset;
            const staged = await window.easydrawDesktop?.readAsset({
              projectPath: opened.projectPath,
              relativePath: asset.relativePath
            });
            const portable = await window.easydrawDesktop?.readAsset({
              projectPath: opened.projectPath,
              relativePath: asset.relativePath
            });
            return Boolean(
              asset.width > 0 &&
              asset.height > 0 &&
              staged.data.length > 20 &&
              staged.data === portable.data
            );
          })(),
          clipboardAssetRoundTrip: await (async () => {
            const opened = await window.easydrawDesktop?.openProject();
            const inserted =
              await window.easydrawDesktop?.importClipboardAsset({
                projectPath: opened.projectPath,
                data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
                mimeType: "image/png",
                fileName: "clipboard-reference.png"
              });
            const asset = inserted.asset;
            const staged = await window.easydrawDesktop?.readAsset({
              projectPath: opened.projectPath,
              relativePath: asset.relativePath
            });
            return Boolean(
              asset.kind === "image" &&
              asset.fileName === "clipboard-reference.png" &&
              asset.mimeType === "image/png" &&
              asset.width > 0 &&
              asset.height > 0 &&
              inserted.data === staged.data
            );
          })(),
          clipboardSvgRoundTrip: await (async () => {
            const opened = await window.easydrawDesktop?.openProject();
            const inserted =
              await window.easydrawDesktop?.importClipboardAsset({
                projectPath: opened.projectPath,
                data: btoa(
                  '<svg viewBox="0 0 24 16"><path d="M0 0h24v16H0z" fill="currentColor"/></svg>'
                ),
                mimeType: "image/svg+xml",
                fileName: "clipboard-icon.svg"
              });
            const asset = inserted.asset;
            const staged = await window.easydrawDesktop?.readAsset({
              projectPath: opened.projectPath,
              relativePath: asset.relativePath
            });
            return Boolean(
              asset.kind === "svg" &&
              asset.fileName === "clipboard-icon.svg" &&
              asset.mimeType === "image/svg+xml" &&
              asset.width === 24 &&
              asset.height === 16 &&
              inserted.data === staged.data
            );
          })(),
          svgRoundTrip: await (async () => {
            const opened = await window.easydrawDesktop?.openProject();
            const inserted = await window.easydrawDesktop?.importAsset({
              projectPath: opened.projectPath,
              sourcePath: ${JSON.stringify(smokeSvgPath)}
            });
            const asset = inserted.asset;
            const staged = await window.easydrawDesktop?.readAsset({
              projectPath: opened.projectPath,
              relativePath: asset.relativePath
            });
            return Boolean(
              asset.kind === "svg" &&
              asset.mimeType === "image/svg+xml" &&
              asset.width === 48 &&
              asset.height === 32 &&
              staged.data.length > 40
            );
          })(),
          iconLibraryRoundTrip: await (async () => {
            const opened = await window.easydrawDesktop?.openProject();
            const library = await window.easydrawDesktop?.listIconLibrary();
            const icon = library?.icons?.[0];
            const preview = await window.easydrawDesktop?.readIconLibraryIcon({
              iconId: icon.id
            });
            const inserted = await window.easydrawDesktop?.insertIconLibraryIcon({
              iconId: icon.id,
              projectPath: opened.projectPath
            });
            const reused = await window.easydrawDesktop?.insertIconLibraryIcon({
              iconId: icon.id,
              projectPath: opened.projectPath
            });
            const asset = inserted.asset;
            return Boolean(
              library.configured === true &&
              library.icons.length === 1690 &&
              library.groups.length === 20 &&
              preview.mimeType === "image/svg+xml" &&
              preview.data.length > 40 &&
              inserted.data === preview.data &&
              reused.copied === false &&
              reused.asset.id === asset.id &&
              reused.data === inserted.data &&
              asset.kind === "svg" &&
              asset.width > 0 &&
              asset.height > 0
            );
          })(),
          imagePlaceholderRoundTrip: await (async () => {
            const opened = await window.easydrawDesktop?.openProject();
            const inserted =
              await window.easydrawDesktop?.insertImagePlaceholder({
                projectPath: opened.projectPath
              });
            const asset = inserted.asset;
            const staged = await window.easydrawDesktop?.readAsset({
              projectPath: opened.projectPath,
              relativePath: asset.relativePath
            });
            return Boolean(
              asset.kind === "svg" &&
              asset.fileName === "image-placeholder-logo.svg" &&
              asset.mimeType === "image/svg+xml" &&
              asset.width === 24 &&
              asset.height === 24 &&
              inserted.data === staged.data &&
              staged.data.length > 200
            );
          })(),
          iconLibraryUi: await (async () => {
            document.querySelector('.easydraw-icon-library__trigger')?.click();
            const deadline = Date.now() + 3000;
            while (
              !document.querySelector(".icon-library-popover__item") &&
              Date.now() < deadline
            ) {
              await new Promise((resolve) => setTimeout(resolve, 50));
            }
            const button = document.querySelector(".icon-library-popover__item");
            if (!button) {
              return false;
            }
            button.click();
            await new Promise((resolve) => setTimeout(resolve, 2500));
            document.querySelector('[aria-controls="selection-toolbar-color"]')?.click();
            await new Promise((resolve) => setTimeout(resolve, 150));
            const redStroke =
              document.querySelector(
                '[data-testid="icon-stroke-color-e03131"]'
              ) ||
              document.querySelector(
                '[data-testid="color-top-pick-#e03131"]'
              ) ||
              document.querySelector(
                '.color-picker__top-picks button[title="#e03131"]'
              );
            return Boolean(
              document.querySelector(".easydraw-icon-library__trigger") &&
              !document.querySelector(".icon-library-popover") &&
              redStroke
            );
          })(),
          directVectorUi: Boolean(
            document.querySelector('[data-canvas-engine="easydraw-source-v1"]') &&
            !document.querySelector(".svg-vector-layer") &&
            !document.querySelector(
              ".easydraw__embeddable-container"
            )
          ),
          materialLibraryUi: await (async () => {
            const materialTab = document.querySelector(
              '[data-panel-tab="materials"]'
            );
            materialTab?.click();
            await new Promise((resolve) => setTimeout(resolve, 100));
            const valid = Boolean(
              materialTab?.getAttribute("aria-selected") === "true" &&
              document.querySelector(".material-panel") &&
              document.querySelector(".material-library-empty") &&
              document.querySelector(".material-add-button")
            );
            document.querySelector('[data-panel-tab="canvases"]')?.click();
            return valid;
          })(),
          debouncedAutoSave: await (async () => {
            await new Promise((resolve) => setTimeout(resolve, 1200));
            const opened = await window.easydrawDesktop?.openProject();
            return opened?.document?.revision >= 1;
          })(),
          batchExport: await (async () => {
            const result = await window.easydrawDesktop?.savePages([
              {
                fileName: "01-首页@2x.png",
                data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
              }
            ]);
            return result?.filePaths?.length === 1;
          })(),
          desktopMenuHidden:
            getComputedStyle(document.querySelector(".menu-bar")).display ===
            "none",
          canvasPanelPresent: Boolean(
            document.querySelector('[data-panel-tab="canvases"]')
          ),
          bodyText: document.body.innerText.slice(0, 160)
        }))()
      `);
      const strokeBounds =
        await mainWindow.webContents.executeJavaScript(`
          (() => {
            const box = (
              document.querySelector(
                '[data-testid="icon-stroke-color-e03131"]'
              ) ||
              document.querySelector(
                '[data-testid="color-top-pick-#e03131"]'
              ) ||
              document.querySelector(
                '.color-picker__top-picks button[title="#e03131"]'
              )
            )?.getBoundingClientRect();
            return box
              ? {
                  x: Math.round(box.x + box.width / 2),
                  y: Math.round(box.y + box.height / 2)
                }
              : null;
          })()
        `);
      if (strokeBounds) {
        mainWindow.webContents.sendInputEvent({
          type: "mouseDown",
          x: strokeBounds.x,
          y: strokeBounds.y,
          button: "left",
          clickCount: 1,
        });
        mainWindow.webContents.sendInputEvent({
          type: "mouseUp",
          x: strokeBounds.x,
          y: strokeBounds.y,
          button: "left",
          clickCount: 1,
        });
        await new Promise((resolve) => setTimeout(resolve, 1400));
      }
      result.iconStrokeUi =
        await mainWindow.webContents.executeJavaScript(`
          (async () => {
            const opened = await window.easydrawDesktop?.openProject();
            return Boolean(
              (
                document
                  .querySelector('[data-testid="icon-stroke-color-e03131"]')
                  ?.getAttribute("aria-pressed") === "true" ||
                document
                  .querySelector('[data-testid="color-top-pick-#e03131"]')
                  ?.classList.contains("active") === true ||
                document
                  .querySelector(
                    '.color-picker__top-picks button[title="#e03131"]'
                  )
                  ?.classList.contains("active") === true
              ) &&
              Object.values(opened?.document?.canvases ?? {}).flatMap((canvas) => canvas.scene.elements).some(
                (element) =>
                  element.type === "rectangle" && element.vectorData &&
                  element.strokeColor === "#e03131"
              )
            );
          })()
        `);
      await mainWindow.webContents.executeJavaScript(`
        document.querySelector('[aria-controls="selection-toolbar-color"][aria-expanded="true"]')?.click()
      `);
      await new Promise((resolve) => setTimeout(resolve, 80));
      const smokeWindowWasVisible = mainWindow.isVisible();
      if (!smokeWindowWasVisible) {
        mainWindow.show();
        await new Promise((resolve) => setTimeout(resolve, 80));
      }
      mainWindow.webContents.focus();
      await mainWindow.webContents.executeJavaScript(`
        document.querySelector('[aria-label="收起右侧边栏"]')?.click()
      `);
      await new Promise((resolve) => setTimeout(resolve, 120));
      const iconBeforeDrag =
        await mainWindow.webContents.executeJavaScript(`
          (async () => {
            const opened = await window.easydrawDesktop?.openProject();
            const icons = Object.values(opened?.document?.canvases ?? {}).flatMap((canvas) => canvas.scene.elements).filter(
              (element) => element.type === "rectangle" && element.vectorData
            );
            const host = document.querySelector(".canvas-wrap");
            if (!icons?.length || !host) return null;
            const zoom = Number(host.dataset.viewportZoom);
            const scrollX = Number(host.dataset.viewportScrollX);
            const scrollY = Number(host.dataset.viewportScrollY);
            const offsetLeft = Number(host.dataset.viewportOffsetLeft);
            const offsetTop = Number(host.dataset.viewportOffsetTop);
            const icon = icons.reduce((closest, candidate) => {
              const candidateX =
                (candidate.x + candidate.width / 2 + scrollX) * zoom +
                offsetLeft;
              const candidateY =
                (candidate.y + candidate.height / 2 + scrollY) * zoom +
                offsetTop;
              const closestX =
                (closest.x + closest.width / 2 + scrollX) * zoom +
                offsetLeft;
              const closestY =
                (closest.y + closest.height / 2 + scrollY) * zoom +
                offsetTop;
              const candidateDistance =
                Math.hypot(
                  candidateX - window.innerWidth / 2,
                  candidateY - window.innerHeight / 2
                );
              const closestDistance =
                Math.hypot(
                  closestX - window.innerWidth / 2,
                  closestY - window.innerHeight / 2
                );
              return candidateDistance < closestDistance
                ? candidate
                : closest;
            });
            if (!icon.vectorData?.paths?.length) return null;
            const [viewX, viewY, viewWidth, viewHeight] =
              icon.vectorData.viewBox;
            const context = document.createElement("canvas").getContext("2d");
            if (!context) return null;
            const pathRecords = icon.vectorData.paths.map((record) => {
              const path = new Path2D();
              path.addPath(
                new Path2D(record.d),
                new DOMMatrix(record.transform)
              );
              return { path, record };
            });
            const pathThreshold =
              8 / zoom *
              Math.max(viewWidth / icon.width, viewHeight / icon.height);
            const isActualPathHit = (pathX, pathY) =>
              pathRecords.some(({ path, record }) => {
                if (
                  record.fill !== "none" &&
                  context.isPointInPath(
                    path,
                    pathX,
                    pathY,
                    record.fillRule
                  )
                ) return true;
                if (record.stroke === "none" || record.strokeWidth <= 0) {
                  return false;
                }
                context.lineCap = record.lineCap;
                context.lineJoin = record.lineJoin;
                context.miterLimit = record.miterLimit;
                context.lineWidth = record.strokeWidth;
                return context.isPointInStroke(path, pathX, pathY);
              });
            const isExpandedPathHit = (
              pathX,
              pathY,
              tolerance = pathThreshold
            ) =>
              pathRecords.some(({ path, record }) => {
                if (record.fill !== "none") {
                  if (
                    context.isPointInPath(
                      path,
                      pathX,
                      pathY,
                      record.fillRule
                    )
                  ) return true;
                  context.lineCap = "round";
                  context.lineJoin = "round";
                  context.lineWidth = tolerance * 2;
                  if (context.isPointInStroke(path, pathX, pathY)) return true;
                }
                if (record.stroke === "none" || record.strokeWidth <= 0) {
                  return false;
                }
                context.lineCap = record.lineCap;
                context.lineJoin = record.lineJoin;
                context.miterLimit = record.miterLimit;
                context.lineWidth =
                  record.strokeWidth + tolerance * 2;
                return context.isPointInStroke(path, pathX, pathY);
              });
            let hitPoint = null;
            let expandedPoint = null;
            let blankPoint = null;
            for (let row = 1; row < 48; row += 1) {
              for (let column = 1; column < 48; column += 1) {
                const pathX = viewX + viewWidth * column / 48;
                const pathY = viewY + viewHeight * row / 48;
                const actualHit = isActualPathHit(pathX, pathY);
                const expandedHit = isExpandedPathHit(
                  pathX,
                  pathY,
                  pathThreshold * 0.5
                );
                if (!hitPoint && actualHit) hitPoint = { pathX, pathY };
                if (!expandedPoint && !actualHit && expandedHit) {
                  expandedPoint = { pathX, pathY };
                }
                if (
                  row >= 12 && row <= 36 &&
                  column >= 12 && column <= 36 &&
                  !actualHit
                ) {
                  const distanceToCenter = Math.hypot(
                    column - 24,
                    row - 24
                  );
                  if (
                    !blankPoint ||
                    distanceToCenter < blankPoint.distanceToCenter
                  ) {
                    blankPoint = { pathX, pathY, distanceToCenter };
                  }
                }
              }
            }
            if (!hitPoint || !expandedPoint || !blankPoint) return null;
            const toViewport = (point) => {
              const localX =
                (point.pathX - viewX) * icon.width / viewWidth;
              const localY =
                (point.pathY - viewY) * icon.height / viewHeight;
              const centerX = icon.x + icon.width / 2;
              const centerY = icon.y + icon.height / 2;
              const deltaX = localX - icon.width / 2;
              const deltaY = localY - icon.height / 2;
              const radians = icon.angle;
              const sceneX =
                centerX + deltaX * Math.cos(radians) -
                deltaY * Math.sin(radians);
              const sceneY =
                centerY + deltaX * Math.sin(radians) +
                deltaY * Math.cos(radians);
              return {
                sceneX,
                sceneY,
                x: Math.round((sceneX + scrollX) * zoom + offsetLeft),
                y: Math.round((sceneY + scrollY) * zoom + offsetTop)
              };
            };
            const hitViewport = toViewport(hitPoint);
            const expandedViewport = toViewport(expandedPoint);
            const blankViewport = toViewport(blankPoint);
            const farViewport = toViewport({
              pathX: viewX - pathThreshold * 3,
              pathY: viewY - pathThreshold * 3
            });
            return {
              id: icon.id,
              left: icon.x,
              top: icon.y,
              zoom,
              scrollX,
              scrollY,
              offsetLeft,
              offsetTop,
              sceneX: hitViewport.sceneX,
              sceneY: hitViewport.sceneY,
              hostBounds: (() => {
                const bounds = host.getBoundingClientRect();
                return { left: bounds.left, top: bounds.top };
              })(),
              x: expandedViewport.x,
              y: expandedViewport.y,
              actualX: hitViewport.x,
              actualY: hitViewport.y,
              blankX: blankViewport.x,
              blankY: blankViewport.y,
              farX: farViewport.x,
              farY: farViewport.y,
              deselectX: Math.round(window.innerWidth * 0.25),
              deselectY: Math.round(window.innerHeight * 0.08)
            };
          })()
        `);
      result.iconDragUi = false;
      result.iconExpandedPathUi = false;
      result.iconBlankHotzoneUi = false;
      result.iconSelectedBoxUi = false;
      result.iconDragStart = iconBeforeDrag;
      if (iconBeforeDrag) {
        const selectedDragDelta = { x: 36, y: 24 };
        const selectedBlankX = iconBeforeDrag.blankX;
        const selectedBlankY = iconBeforeDrag.blankY;
        mainWindow.webContents.sendInputEvent({
          type: "mouseMove",
          x: iconBeforeDrag.actualX,
          y: iconBeforeDrag.actualY,
          movementX: 0,
          movementY: 0,
        });
        await new Promise((resolve) => setTimeout(resolve, 80));
        mainWindow.webContents.sendInputEvent({
          type: "mouseDown",
          x: iconBeforeDrag.actualX,
          y: iconBeforeDrag.actualY,
          button: "left",
          clickCount: 1,
        });
        mainWindow.webContents.sendInputEvent({
          type: "mouseUp",
          x: iconBeforeDrag.actualX,
          y: iconBeforeDrag.actualY,
          button: "left",
          clickCount: 1,
        });
        await new Promise((resolve) => setTimeout(resolve, 500));
        mainWindow.webContents.sendInputEvent({
          type: "mouseMove",
          x: selectedBlankX,
          y: selectedBlankY,
          movementX: 0,
          movementY: 0,
        });
        await new Promise((resolve) => setTimeout(resolve, 80));
        result.iconSelectedBoxCursor =
          await mainWindow.webContents.executeJavaScript(`
            (() => {
              const target = document.elementFromPoint(
                ${JSON.stringify(selectedBlankX)},
                ${JSON.stringify(selectedBlankY)}
              );
              return target ? getComputedStyle(target).cursor : null;
            })()
          `);
        mainWindow.webContents.sendInputEvent({
          type: "mouseDown",
          x: selectedBlankX,
          y: selectedBlankY,
          button: "left",
          clickCount: 1,
        });
        await new Promise((resolve) => setTimeout(resolve, 80));
        mainWindow.webContents.sendInputEvent({
          type: "mouseMove",
          x: selectedBlankX + 18,
          y: selectedBlankY + 12,
          button: "left",
          movementX: 18,
          movementY: 12,
        });
        await new Promise((resolve) => setTimeout(resolve, 50));
        mainWindow.webContents.sendInputEvent({
          type: "mouseMove",
          x: selectedBlankX + selectedDragDelta.x,
          y: selectedBlankY + selectedDragDelta.y,
          button: "left",
          movementX: selectedDragDelta.x - 18,
          movementY: selectedDragDelta.y - 12,
        });
        await new Promise((resolve) => setTimeout(resolve, 120));
        mainWindow.webContents.sendInputEvent({
          type: "mouseUp",
          x: selectedBlankX + selectedDragDelta.x,
          y: selectedBlankY + selectedDragDelta.y,
          button: "left",
          clickCount: 1,
        });
        await new Promise((resolve) => setTimeout(resolve, 1200));
        const iconAfterSelectedDrag =
          await mainWindow.webContents.executeJavaScript(`
            (async () => {
              const deadline = Date.now() + 5000;
              let icon;
              do {
                const opened = await window.easydrawDesktop?.openProject();
                icon = Object.values(opened?.document?.canvases ?? {}).flatMap((canvas) => canvas.scene.elements).find(
                  (element) => element.id === ${JSON.stringify(iconBeforeDrag?.id)}
                );
                if (icon && (icon.x !== ${JSON.stringify(iconBeforeDrag?.left)} || icon.y !== ${JSON.stringify(iconBeforeDrag?.top)})) break;
                await new Promise((resolve) => setTimeout(resolve, 100));
              } while (Date.now() < deadline);
              return icon ? { left: icon.x, top: icon.y } : null;
            })()
          `);
        const expectedSelectedSceneDelta = {
          x: selectedDragDelta.x / iconBeforeDrag.zoom,
          y: selectedDragDelta.y / iconBeforeDrag.zoom,
        };
        const selectedBoxMoved = Boolean(
          iconAfterSelectedDrag &&
            Math.abs(
              iconAfterSelectedDrag.left -
                iconBeforeDrag.left -
                expectedSelectedSceneDelta.x,
            ) <= 16 &&
            Math.abs(
              iconAfterSelectedDrag.top -
                iconBeforeDrag.top -
                expectedSelectedSceneDelta.y,
            ) <= 16,
        );
        result.iconSelectedBoxUi =
          selectedBoxMoved ||
          ["move", "pointer"].includes(result.iconSelectedBoxCursor);
        result.iconDragUi = selectedBoxMoved;
        result.iconDragDelta = iconAfterSelectedDrag
          ? {
              x: iconAfterSelectedDrag.left - iconBeforeDrag.left,
              y: iconAfterSelectedDrag.top - iconBeforeDrag.top,
            }
          : null;
        mainWindow.webContents.sendInputEvent({
          type: "keyDown",
          keyCode: "Escape",
        });
        mainWindow.webContents.sendInputEvent({
          type: "keyUp",
          keyCode: "Escape",
        });
        await new Promise((resolve) => setTimeout(resolve, 120));
        const probeDragDelta = { x: 18, y: 12 };
        // Object snapping can change the gesture delta. Probe the actual saved position.
        const actualViewportDelta = iconAfterSelectedDrag
          ? { x: Math.round((iconAfterSelectedDrag.left - iconBeforeDrag.left) * iconBeforeDrag.zoom),
              y: Math.round((iconAfterSelectedDrag.top - iconBeforeDrag.top) * iconBeforeDrag.zoom) }
          : { x: 0, y: 0 };
        const movedFarX = iconBeforeDrag.farX + actualViewportDelta.x;
        const movedFarY = iconBeforeDrag.farY + actualViewportDelta.y;
        mainWindow.webContents.sendInputEvent({
          type: "mouseDown",
          x: movedFarX,
          y: movedFarY,
          button: "left",
          clickCount: 1,
        });
        mainWindow.webContents.sendInputEvent({
          type: "mouseMove",
          x: movedFarX + probeDragDelta.x,
          y: movedFarY + probeDragDelta.y,
          button: "left",
          movementX: probeDragDelta.x,
          movementY: probeDragDelta.y,
        });
        mainWindow.webContents.sendInputEvent({
          type: "mouseUp",
          x: movedFarX + probeDragDelta.x,
          y: movedFarY + probeDragDelta.y,
          button: "left",
          clickCount: 1,
        });
        await new Promise((resolve) => setTimeout(resolve, 1200));
        const iconAfterBlankDrag =
          await mainWindow.webContents.executeJavaScript(`
            (async () => {
              const opened = await window.easydrawDesktop?.openProject();
              const icon = Object.values(opened?.document?.canvases ?? {}).flatMap((canvas) => canvas.scene.elements).find(
                (element) => element.id === ${JSON.stringify(iconBeforeDrag?.id)}
              );
              return icon ? { left: icon.x, top: icon.y } : null;
            })()
          `);
        result.iconBlankHotzoneUi = Boolean(
          iconAfterBlankDrag && iconAfterSelectedDrag &&
          Math.abs(iconAfterBlankDrag.left - iconAfterSelectedDrag.left) < 0.1 &&
          Math.abs(iconAfterBlankDrag.top - iconAfterSelectedDrag.top) < 0.1
        );
        const movedExpandedX = iconBeforeDrag.x + actualViewportDelta.x;
        const movedExpandedY = iconBeforeDrag.y + actualViewportDelta.y;
        mainWindow.webContents.sendInputEvent({
          type: "mouseMove",
          x: movedExpandedX,
          y: movedExpandedY,
          movementX: 0,
          movementY: 0,
        });
        await new Promise((resolve) => setTimeout(resolve, 80));
        result.iconExpandedHoverCursor =
          await mainWindow.webContents.executeJavaScript(`
            (() => {
              const target = document.elementFromPoint(
                ${JSON.stringify(movedExpandedX)},
                ${JSON.stringify(movedExpandedY)}
              );
              return target ? getComputedStyle(target).cursor : null;
            })()
          `);
        result.iconExpandedPathUi =
          ["move", "pointer"].includes(result.iconExpandedHoverCursor);
      }
      result.manualHistory = await mainWindow.webContents.executeJavaScript(`
        (async () => {
          const readIcon = async () => {
            const opened = await window.easydrawDesktop.openProject();
            return Object.values(opened.document.canvases).flatMap((canvas) => canvas.scene.elements)
              .find((element) => element.id === ${JSON.stringify(iconBeforeDrag?.id)});
          };
          const moved = await readIcon();
          document.querySelector('.history-control [aria-label="撤销"]')?.click();
          await new Promise((resolve) => setTimeout(resolve, 1250));
          const undone = await readIcon();
          document.querySelector('.history-control [aria-label="重做"]')?.click();
          await new Promise((resolve) => setTimeout(resolve, 1250));
          const redone = await readIcon();
          return Boolean(moved && undone && redone &&
            (moved.x !== undone.x || moved.y !== undone.y) && moved.x === redone.x && moved.y === redone.y);
        })()
      `);
      if (process.env.EASYDRAW_CAPTURE_STROKE) {
        const target = path.resolve(
          process.env.EASYDRAW_CAPTURE_STROKE,
        );
        await fs.mkdir(path.dirname(target), { recursive: true });
        const screenshot = await mainWindow.webContents.capturePage();
        await fs.writeFile(target, screenshot.toPNG());
      }
      if (!smokeWindowWasVisible) {
        mainWindow.hide();
      }
      if (
        !result.hasAppShell ||
        !result.hasDesktopApi ||
        result.projectRoundTrip !== 0 ||
        result.assetRoundTrip !== true ||
        result.clipboardAssetRoundTrip !== true ||
        result.clipboardSvgRoundTrip !== true ||
        result.svgRoundTrip !== true ||
        result.iconLibraryRoundTrip !== true ||
        result.imagePlaceholderRoundTrip !== true ||
        result.iconLibraryUi !== true ||
        result.directVectorUi !== true ||
        result.iconStrokeUi !== true ||
        result.iconBlankHotzoneUi !== true ||
        result.iconExpandedPathUi !== true ||
        result.iconDragUi !== true ||
        result.manualHistory !== true ||
        result.iconSelectedBoxUi !== true ||
        result.materialLibraryUi !== true ||
        result.debouncedAutoSave !== true ||
        result.batchExport !== true ||
        result.desktopMenuHidden !== true ||
        result.canvasPanelPresent !== true
      ) {
        throw new Error(`renderer root missing: ${JSON.stringify(result)}`);
      }
      if (process.env.EASYDRAW_CAPTURE_BASELINE) {
        const target = path.resolve(process.env.EASYDRAW_CAPTURE_BASELINE);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await mainWindow.webContents.executeJavaScript(`
          document.querySelector('[aria-label="选择页面 1"]')?.click()
        `);
        await new Promise((resolve) => setTimeout(resolve, 180));
        const screenshot = await mainWindow.webContents.capturePage();
        await fs.writeFile(target, screenshot.toPNG());
      }
      if (process.env.EASYDRAW_CAPTURE_ICONS) {
        const target = path.resolve(
          process.env.EASYDRAW_CAPTURE_ICONS,
        );
        await fs.mkdir(path.dirname(target), { recursive: true });
        await mainWindow.webContents.executeJavaScript(`
          document.querySelector('.easydraw-icon-library__trigger')?.click()
        `);
        await new Promise((resolve) => setTimeout(resolve, 900));
        const panelBounds =
          await mainWindow.webContents.executeJavaScript(`
            (() => {
              const box = document.querySelector(".icon-library-popover")
                ?.getBoundingClientRect();
              return box
                ? {
                    x: Math.round(box.x),
                    y: Math.round(box.y),
                    width: Math.round(box.width),
                    height: Math.round(box.height)
                  }
                : null;
            })()
          `);
        const screenshot = panelBounds
          ? await mainWindow.webContents.capturePage(panelBounds)
          : await mainWindow.webContents.capturePage();
        await fs.writeFile(target, screenshot.toPNG());
      }
      console.log(`EASYDRAW_DESKTOP_SMOKE_OK ${JSON.stringify(result)}`);
      app.exit(0);
    } catch (error) {
      console.error("EASYDRAW_DESKTOP_SMOKE_FAILED", error);
      app.exit(1);
    }
};

exports.attachDiagnostics = (window) => {
  window.webContents.on("console-message", (details) => {
    if (details.level === "error") console.error("SMOKE_RENDERER_ERROR", details.message);
  });
};
