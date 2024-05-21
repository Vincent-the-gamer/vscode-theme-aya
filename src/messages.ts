export default {
    admin: "Run VS Code with admin privileges so the changes can be applied.",
	enabled:
		"Aya Bladelight enabled. Restart to take effect. " +
		"If Code complains about it is corrupted, CLICK DON'T SHOW AGAIN. " +
		"See README for more detail.",
	disabled: "Aya Bladelight disabled and reverted to default. Restart to take effect.",
	already_disabled: "Aya Bladelight already disabled.",
	somethingWrong: "Something went wrong: ",
	restartIde: "Restart Visual Studio Code",
	notfound: "Aya Bladelight not found.",
	notConfigured:
		"Aya Bladelight path not configured. " +
		'Please set "aya.imports" in your user settings.',
	reloadAfterVersionUpgrade:
		"Detected reloading CSS / JS after VSCode is upgraded. " + "Performing application only.",
	cannotLoad: (url: string) => `Cannot load '${url}'. Skipping.`
}