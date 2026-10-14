import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'СТМ 2.0 | Служба по трудова медицина',description:'Защитена работна среда за СТМ'};
export default function RootLayout({children}:{children:React.ReactNode}) {return <html lang="bg"><body>{children}</body></html>}
