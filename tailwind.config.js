/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "hsl(0 0% 3.92%)",
        foreground: "hsl(0 0% 98%)",
        card: "hsl(0 0% 5.88%)",
        "card-foreground": "hsl(0 0% 98%)",
        popover: "hsl(0 0% 5.88%)",
        "popover-foreground": "hsl(0 0% 98%)",
        primary: "hsl(210 100% 52%)",
        "primary-foreground": "hsl(210 10% 98%)",
        secondary: "hsl(0 0% 14.9%)",
        "secondary-foreground": "hsl(0 0% 98%)",
        muted: "hsl(0 0% 14.9%)",
        "muted-foreground": "hsl(0 0% 63.9%)",
        accent: "hsl(0 0% 14.9%)",
        "accent-foreground": "hsl(0 0% 98%)",
        destructive: "hsl(0 62.8% 50.6%)",
        "destructive-foreground": "hsl(0 0% 98%)",
        border: "hsl(0 0% 14.9%)",
        input: "hsl(0 0% 14.9%)",
        ring: "hsl(210 100% 52%)",
        brand: {
          50: "hsl(210 100% 96%)",
          100: "hsl(210 100% 90%)",
          200: "hsl(210 100% 80%)",
          300: "hsl(210 100% 70%)",
          400: "hsl(210 100% 60%)",
          500: "hsl(210 100% 52%)",
          600: "hsl(210 100% 45%)",
          700: "hsl(210 100% 35%)",
          800: "hsl(210 100% 25%)",
          900: "hsl(210 100% 15%)",
        },
      },
      borderRadius: {
        lg: "0.75rem",
        md: "0.5rem",
        sm: "0.25rem",
        xl: "1rem",
        "2xl": "1.5rem",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      spacing: {
        18: "4.5rem",
        88: "22rem",
      },
      animation: {
        "fade-in": "fadeIn 0.5s ease-out",
        "slide-up": "slideUp 0.6s ease-out",
        "slide-down": "slideDown 0.3s ease-out",
        "scale-in": "scaleIn 0.3s ease-out",
        "float": "float 6s ease-in-out infinite",
        "grid-scroll": "gridScroll 20s linear infinite",
        "pulse-glow": "pulseGlow 4s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideDown: {
          "0%": { opacity: "0", transform: "translateY(-10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        scaleIn: {
          "0%": { opacity: "0", transform: "scale(0.95)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-20px)" },
        },
        gridScroll: {
          "0%": { backgroundPosition: "0px 0px" },
          "100%": { backgroundPosition: "0px 80px" },
        },
        pulseGlow: {
          "0%, 100%": { opacity: "0.4", transform: "scale(1)" },
          "50%": { opacity: "0.8", transform: "scale(1.05)" },
        },
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
