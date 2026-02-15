import Header from "./Header"
import Footer from "./Footer"
import BottomNavigation from "./BottomNavigation"

interface AuthenticatedLayoutProps {
  children: React.ReactNode
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "4xl" | "6xl"
}

export default function AuthenticatedLayout({
  children,
  maxWidth = "4xl",
}: AuthenticatedLayoutProps) {
  const maxWidthClass = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
    "2xl": "max-w-2xl",
    "4xl": "max-w-4xl",
    "6xl": "max-w-6xl",
  }[maxWidth]

  return (
    <>
      <Header />
      <main className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-blue-50">
        <div className={`${maxWidthClass} mx-auto px-3 sm:px-6 py-4 sm:py-8`}>
          {children}
        </div>
      </main>
      <Footer />
      <BottomNavigation />
    </>
  )
}
