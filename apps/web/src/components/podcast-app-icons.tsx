type PodcastAppIconProps = {
  className?: string;
};

export function ApplePodcastsIcon({
  className = "h-5 w-5",
}: PodcastAppIconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 32 32"
    >
      <rect fill="#F5F1FF" height="32" rx="8" width="32" />
      <circle cx="16" cy="11.5" fill="#8B5CF6" r="2.25" />
      <path
        d="M13.25 24.5c0-2.24 1.23-5.75 2.75-5.75s2.75 3.51 2.75 5.75"
        stroke="#8B5CF6"
        strokeLinecap="round"
        strokeWidth="2"
      />
      <path
        d="M11.35 14.3a4.65 4.65 0 0 1 9.3 0"
        stroke="#A855F7"
        strokeLinecap="round"
        strokeWidth="2"
      />
      <path
        d="M8.4 14.95a7.6 7.6 0 0 1 15.2 0"
        stroke="#C084FC"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

export function PocketCastsIcon({
  className = "h-5 w-5",
}: PodcastAppIconProps) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24">
      <rect fill="#F43F22" height="24" rx="5" width="24" />
      <circle cx="12" cy="12" fill="white" r="3" />
      <path
        d="M7 12a5 5 0 0 1 5-5M17 12a5 5 0 0 1-5 5"
        fill="none"
        stroke="white"
        strokeLinecap="round"
        strokeWidth="2"
      />
      <path
        d="M4.5 12a7.5 7.5 0 0 1 7.5-7.5M19.5 12a7.5 7.5 0 0 1-7.5 7.5"
        fill="none"
        stroke="white"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

export function OvercastIcon({ className = "h-5 w-5" }: PodcastAppIconProps) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24">
      <rect fill="#FC7E0F" height="24" rx="5" width="24" />
      <circle cx="12" cy="12" fill="white" r="3" />
      <path
        d="M5.5 18.5a9.5 9.5 0 0 1 0-13M18.5 5.5a9.5 9.5 0 0 1 0 13"
        fill="none"
        stroke="white"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

export function CastroIcon({ className = "h-5 w-5" }: PodcastAppIconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 32 32"
    >
      <rect fill="#F3ECE5" height="32" rx="8" width="32" />
      <rect fill="#A67C52" height="14" rx="3" width="18" x="7" y="9" />
      <circle cx="12.5" cy="16" fill="#F3ECE5" r="2.2" />
      <circle cx="19.5" cy="16" fill="#F3ECE5" r="2.2" />
      <path
        d="M10 11.5h12"
        stroke="#F8F5F1"
        strokeLinecap="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

export function AntennaPodIcon({ className = "h-5 w-5" }: PodcastAppIconProps) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24">
      <rect fill="#FF6B2B" height="24" rx="5" width="24" />
      <path
        d="M12 5v14M8 9l4-4 4 4"
        fill="none"
        stroke="white"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <circle cx="12" cy="14" fill="white" r="3" />
    </svg>
  );
}

export function YouTubeMusicIcon({
  className = "h-5 w-5",
}: PodcastAppIconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 32 32"
    >
      <rect fill="#FFFFFF" height="32" rx="8" width="32" />
      <circle cx="16" cy="16" fill="#FF0033" r="10" />
      <circle cx="16" cy="16" fill="white" r="6.1" />
      <path d="M14.2 12.5 20 16l-5.8 3.5z" fill="#FF0033" />
    </svg>
  );
}
