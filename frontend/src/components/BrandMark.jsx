import React from "react";
import logo from "../logo.jpeg";

export default function BrandMark({ dark = false, compact = false }) {
	return (
		<div className={`brand-lockup${dark ? " brand-lockup--dark" : ""}${compact ? " brand-lockup--compact" : ""}`}>
			<div className="brand-mark" aria-hidden="true">
				<img src={logo} alt="SmartPrint logo" className="h-6 w-auto" />
			</div>
			<div className="brand-wordmark">
				<strong>SmartPrint</strong>
				<span>Acessórios de papelaria<br />e gráfica rápida</span>
			</div>
		</div>
	);
}
