

export const MotorcycleIcon = ({ size = 24, className = '' }: { size?: number, className?: string }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
    >
        <circle cx="5.5" cy="17.5" r="3.5" />
        <circle cx="18.5" cy="17.5" r="3.5" />
        <path d="M15 6h-5a1 1 0 0 0-1 1v4h-3v4h3v-2h6v2h3v-4h-3z" />
        <path d="M19 14v-8h-2" />
        <path d="M12 11h5" />
        <path d="M9 17h6" />
        <path d="M12 10.5V6" />
        <path d="M10 6h4" />
    </svg>
);
