const fs = require(" fs\);
const filePath = \frontend/src/pages/Dashboard.jsx\;
let str = fs.readFileSync(filePath, \utf8\);
const regex = /<td data-label=\A[^>]*?es\ className=\px-5 py-3 text-right\>[\\s\\S]*?<\\/div>\\s*<\\/td>/;
const newBlock = <td data-label=\Ações\ className=\px-5 py-3 text-right\>
 <div className=\mx-auto grid w-full max-w-40 grid-cols-2 gap-1.5\>
 <PrintButton orderId={o._id} label=\A4\ className=\!h-8 !w-full !justify-center !gap-1 !rounded-lg !px-1 !py-1 text-[11px]\ />
 <PrintButton orderId={o._id} format=\80mm\ label=\80 mm\ className=\!h-8 !w-full !justify-center !gap-1 !rounded-lg !px-1 !py-1 text-[11px]\ />
 <WhatsAppButton orderId={o._id} iconOnly className=\!h-8 !w-full !justify-center !gap-0 !rounded-lg !px-1 !py-1\ />
 <Link to={\/pedidos/\\} className=\inline-flex h-8 w-full items-center justify-center rounded-lg border px-1 py-1 text-[11px] hover:bg-slate-50\>Abrir</Link>
 </div>
 </td>;
if (regex.test(str)) {
 str = str.replace(regex, newBlock);
 fs.writeFileSync(filePath, str, \utf8\);
 console.log(\SUCCESS: Updated Dashboard.jsx\);
} else {
 console.log(\ERROR: Pattern not matched\);
}

