// @ts-nocheck
(function () {
	function patch() {
		const e1 = document.querySelector(".right-items");
		const e2 = document.querySelector(".right-items .__AYA_INDICATOR_CLS");
		if (e1 && !e2) {
			let e = document.createElement("div");
			e.id = "vincent-the-gamer.aya";
			e.title = "Aya";
			e.className = "statusbar-item right __AYA_INDICATOR_CLS";
			{
				const a = document.createElement("a");
				a.tabIndex = -1;
				a.className = 'statusbar-item-label';
				{
					const span = document.createElement("span");
					span.className = "codicon codicon-paintcan";
					a.appendChild(span);
				}
				e.appendChild(a);
			}
			e1.appendChild(e);
		}
	}
	setInterval(patch, 5000);
})();