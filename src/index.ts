import vscode from "vscode";
import fs from "fs";
import path from "path";
import os from "os";
import msg from "./messages";
import { v4 } from "uuid";
import fetch from "node-fetch";
import Url from "url";

// Lazy loader for the file-url CJS dependency (no ESM types available)
let cachedFileUrl: ((p: string) => string) | undefined;
async function fileUrlForPath(localPath: string): Promise<string> {
	if (!cachedFileUrl) {
		const mod = await import("file-url");
		cachedFileUrl = mod.default ?? mod;
	}
	return cachedFileUrl(localPath);
}

type WorkbenchLocation = [workbenchDir: string, htmlPath: string] | null;

function locateWorkbench(): WorkbenchLocation {
	const appDir = require.main
		? path.dirname(require.main!.filename)
		: (globalThis as any)._VSCODE_FILE_ROOT;

	if (!appDir) {
		vscode.window.showInformationMessage(msg.unableToLocateVsCodeInstallationPath);
		return null;
	}

	const basePath = path.join(appDir, "vs", "code");
	const workbenchDirCandidates = [
		// v1.102+ path
		path.join(basePath, "electron-browser", "workbench"),
		path.join(basePath, "electron-browser"),
		// old path
		path.join(basePath, "electron-sandbox", "workbench"),
		path.join(basePath, "electron-sandbox"),
	];

	const htmlFileNameCandidates = [
		"workbench-dev.html", // VSCode dev
		"workbench.esm.html", // VSCode ESM
		"workbench.html", // VSCode
		"workbench-apc-extension.html", // Cursor
	];

	for (const workbenchDirCandidate of workbenchDirCandidates) {
		for (const htmlFileNameCandidate of htmlFileNameCandidates) {
			const htmlPathCandidate = path.join(workbenchDirCandidate, htmlFileNameCandidate);
			if (fs.existsSync(htmlPathCandidate)) {
				return [workbenchDirCandidate, htmlPathCandidate];
			}
		}
	}

	vscode.window.showInformationMessage(msg.unableToLocateVsCodeInstallationPath);
	return null;
}

function resolveVariable(key: string): string | undefined {
	const variables: Record<string, () => string> = {
		cwd: () => process.cwd(),
		userHome: () => os.homedir(),
		workspaceFolder: () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "",
		execPath: () => process.env.VSCODE_EXEC_PATH ?? process.execPath,
		pathSeparator: () => path.sep,
		"/": () => path.sep,
	};

	if (key in variables) return variables[key]();

	if (key.startsWith("env:")) {
		const [_prefix, envKey, optionalDefault] = key.split(":");
		return process.env[envKey] ?? optionalDefault ?? "";
	}

	return undefined;
}

function parsedUrl(url: string): string {
	if (/^file:/.test(url)) {
		return url.replaceAll(
			/\$\{([^\{\}]+)\}/g,
			(_substr, key) => resolveVariable(key) ?? _substr,
		);
	}
	return url;
}

async function getContent(url: string): Promise<string> {
	if (/^file:/.test(url.toString())) {
		const fp = Url.fileURLToPath(url);
		return await fs.promises.readFile(fp, "utf-8");
	} else {
		const response = await fetch(url);
		return response.text();
	}
}

/**
 * Normalizes a user-provided import value to a file:// URL.
 * - Already a file:// URL → pass through.
 * - Already an http(s):// URL → pass through.
 * - Plain file path (e.g. "C:\\foo.css" or "/home/foo.css") → convert via file-url.
 */
async function normalizeImport(raw: string): Promise<string> {
	// Already a URL with a scheme
	if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) {
		return raw;
	}
	// Plain file path – convert to file:// URL
	return await fileUrlForPath(raw);
}

export function activate(this: any, context: vscode.ExtensionContext) {
	this.extensionName = "vincent-the-gamer.aya";

	const loc = locateWorkbench();
	if (!loc) return;
	const [workbenchDir, htmlPath] = loc;

	function BackupFilePath(uuid: string): string {
		return path.join(workbenchDir, `workbench.${uuid}.bak-aya`);
	}

	// #### main commands ######################################################

	async function cmdInstall() {
		const uuidSession = v4();
		await createBackup(uuidSession);
		await performPatch(uuidSession);
	}

	async function cmdReinstall() {
		await uninstallImpl();
		await cmdInstall();
	}

	async function cmdUninstall() {
		await uninstallImpl();
		disabledRestart();
	}

	async function uninstallImpl() {
		const backupUuid = await getBackupUuid(htmlPath);
		if (!backupUuid) return;
		const backupPath = BackupFilePath(backupUuid);
		await restoreBackup(backupPath);
		await deleteBackupFiles();
	}

	// #### Backup ##############################################################

	async function getBackupUuid(htmlFilePath: string): Promise<string | null> {
		try {
			const htmlContent = await fs.promises.readFile(htmlFilePath, "utf-8");
			const m = htmlContent.match(
				/<!-- !! AYA-SESSION-ID ([0-9a-fA-F-]+) !! -->/,
			);
			if (!m) return null;
			return m[1];
		} catch (e) {
			vscode.window.showInformationMessage(msg.somethingWrong + String(e));
			throw e;
		}
	}

	async function createBackup(uuidSession: string) {
		try {
			let html = await fs.promises.readFile(htmlPath, "utf-8");
			html = clearExistingPatches(html);
			await fs.promises.writeFile(BackupFilePath(uuidSession), html, "utf-8");
		} catch (e) {
			vscode.window.showInformationMessage(msg.admin);
			throw e;
		}
	}

	async function restoreBackup(backupFilePath: string) {
		try {
			if (fs.existsSync(backupFilePath)) {
				await fs.promises.unlink(htmlPath);
				await fs.promises.copyFile(backupFilePath, htmlPath);
			}
		} catch (e) {
			vscode.window.showInformationMessage(msg.admin);
			throw e;
		}
	}

	async function deleteBackupFiles() {
		const htmlDir = path.dirname(htmlPath);
		const htmlDirItems = await fs.promises.readdir(htmlDir);
		for (const item of htmlDirItems) {
			if (item.endsWith(".bak-aya")) {
				await fs.promises.unlink(path.join(htmlDir, item));
			}
		}
	}

	// #### Patching ############################################################

	async function performPatch(uuidSession: string) {
		const config = vscode.workspace.getConfiguration("aya");
		if (!patchIsProperlyConfigured(config)) {
			return vscode.window.showInformationMessage(msg.notConfigured);
		}

		let html = await fs.promises.readFile(htmlPath, "utf-8");
		html = clearExistingPatches(html);

		const injectHTML = await patchHtml(config);
		html = html.replace(
			/<meta\s+http-equiv="Content-Security-Policy"[\s\S]*?\/>/,
			"",
		);

		let indicatorJS = "";
		if (config.statusbar) indicatorJS = await getIndicatorJs();

		// Inject into <head> so auxiliary windows (like New Chat Window) can clone the styles
		html = html.replace(
			/(<\/head>)/,
			`<!-- !! AYA-SESSION-ID ${uuidSession} !! -->\n` +
				"<!-- !! AYA-START !! -->\n" +
				injectHTML +
				"<!-- !! AYA-END !! -->\n</head>",
		);

		// Inject indicator JS into body (this doesn't need to be cloned to auxiliary windows)
		if (indicatorJS) {
			html = html.replace(/(<\/body>)/, indicatorJS + "\n</body>");
		}

		try {
			await fs.promises.writeFile(htmlPath, html, "utf-8");
		} catch (e) {
			vscode.window.showInformationMessage(msg.admin);
			disabledRestart();
			return;
		}
		enabledRestart();
	}

	function clearExistingPatches(html: string): string {
		html = html.replace(
			/<!-- !! AYA-START !! -->[\s\S]*?<!-- !! AYA-END !! -->\n*/,
			"",
		);
		html = html.replace(/<!-- !! AYA-SESSION-ID [\w-]+ !! -->\n*/g, "");
		// Clear indicator JS that was injected into body
		html = html.replace(
			/<script>\/\* eslint-env browser \*\/[\s\S]*?__AYA_INDICATOR_CLS[\s\S]*?<\/script>\n*/g,
			"",
		);
		return html;
	}

	function patchIsProperlyConfigured(config: Record<string, any>): boolean {
		return config && config.imports && config.imports instanceof Array;
	}

	async function patchHtml(config: Record<string, any>): Promise<string> {
		let res = "";
		for (const item of config.imports) {
			const imp = await patchHtmlForItem(item);
			if (imp) res += imp;
		}
		return res;
	}

	async function patchHtmlForItem(url: string): Promise<string> {
		if (!url) return "";
		if (typeof url !== "string") return "";

		try {
			// Normalize plain file paths to file:// URLs before processing
			const normalized = await normalizeImport(url);
			const parsed = new Url.URL(normalized);
			const ext = path.extname(parsed.pathname);

			const resolved = parsedUrl(normalized);
			const fetched = await getContent(resolved);
			if (ext === ".css") {
				return `<style>${fetched}</style>`;
			} else if (ext === ".js") {
				return `<script>${fetched}</script>`;
			}
			throw new Error(`Unsupported extension type: ${ext}`);
		} catch (e) {
			console.error(e);
			vscode.window.showWarningMessage(msg.cannotLoad(url));
			return "";
		}
	}

	async function getIndicatorJs(): Promise<string> {
		let indicatorJsPath;
		const ext = vscode.extensions.getExtension("vincent-the-gamer.aya");
		if (ext && ext.extensionPath) {
			indicatorJsPath = path.resolve(ext.extensionPath, "src/statusbar.ts");
		} else {
			indicatorJsPath = path.resolve(__dirname, "statusbar.ts");
		}
		const indicatorJsContent = await fs.promises.readFile(
			indicatorJsPath,
			"utf-8",
		);
		return `<script>${indicatorJsContent}</script>`;
	}

	function reloadWindow() {
		vscode.commands.executeCommand("workbench.action.reloadWindow");
	}

	function enabledRestart() {
		vscode.window.showInformationMessage(msg.enabled, msg.restartIde).then((btn?: string) => {
			// if close button is clicked btn is undefined, so no reload window
			if (btn === msg.restartIde) {
				reloadWindow();
			}
		});
	}

	function disabledRestart() {
		vscode.window.showInformationMessage(msg.disabled, msg.restartIde).then((btn?: string) => {
			if (btn === msg.restartIde) {
				reloadWindow();
			}
		});
	}

	const installAya = vscode.commands.registerCommand("aya.installAya", cmdInstall);
	const uninstallAya = vscode.commands.registerCommand(
		"aya.uninstallAya",
		cmdUninstall,
	);
	const updateAya = vscode.commands.registerCommand("aya.updateAya", cmdReinstall);

	context.subscriptions.push(installAya);
	context.subscriptions.push(uninstallAya);
	context.subscriptions.push(updateAya);

	console.log("Aya Bladelight is active!");
	console.log("Workbench directory", workbenchDir);
	console.log("Main HTML file", htmlPath);
}

export function deactivate() {}
