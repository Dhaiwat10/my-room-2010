// Every icon is the original: Windows XP's own (shell32, user32 and friends,
// from a clean XP SP2 install), and each app's or game's own icon art.
// They're served from /public as PNGs and drawn at whatever size is asked.

type IconProps = { size?: number };

// `wide` lets a logo that won't fit a square run past it sideways.
function imageIcon(src: string, wide = 1) {
  return function ImageIcon({ size = 32 }: IconProps) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a small icon; next/image adds nothing here
      <img
        src={src}
        width={Math.round(size * wide)}
        height={size}
        alt=""
        aria-hidden="true"
        draggable={false}
        style={{ objectFit: "contain" }}
      />
    );
  };
}

const xp = (name: string) => imageIcon(`/pc/xp/icons/${name}.png`);

// Windows XP
export const NotepadIcon = xp("notepad");
export const TextFileIcon = xp("text");
export const FolderIcon = xp("folder");
export const BriefcaseIcon = xp("briefcase");
export const PicturesIcon = xp("my-pictures");
export const MyDocumentsIcon = xp("my-documents");
export const MyMusicIcon = xp("my-music");
export const MyVideosIcon = xp("my-videos");
export const ComputerIcon = xp("my-computer");
export const ControlPanelIcon = xp("control-panel");
export const RecycleBinIcon = xp("recycle-full");
export const RecycleBinEmptyIcon = xp("recycle-empty");
export const PaintIcon = xp("paint");
export const MovieMakerIcon = xp("movie-maker");
export const GlobeIcon = xp("globe");
export const MailIcon = xp("mail");
export const PowerIcon = xp("turn-off");
export const LogOffIcon = xp("log-off");
export const HardDiskIcon = xp("hard-drive");
export const CdDriveIcon = xp("cd-drive");
export const FloppyIcon = xp("floppy");
export const WordFileIcon = xp("word-doc");
export const ArchiveFileIcon = xp("zip");
export const UnknownFileIcon = xp("unknown");
export const CodeFileIcon = xp("document");
export const WebFileIcon = xp("web-page");
export const MusicFileIcon = xp("media-file");
export const SoundFileIcon = xp("sound-file");
export const VideoFileIcon = xp("movie-file");
export const ImageFileIcon = xp("jpg");
export const ExeIcon = xp("application");
export const DisplayIcon = xp("appearance");
export const NetworkIcon = xp("network");
export const PrinterIcon = xp("printer");
export const AccessibilityIcon = xp("accessibility");
export const UserAccountsIcon = xp("user-accounts");
export const AddRemoveIcon = xp("add-remove");
export const RegionalIcon = xp("regional");
export const PerformanceIcon = xp("performance");
export const SoundsIcon = xp("sounds");
export const SecurityCenterIcon = xp("security-center");
export const UserPicture = xp("user");
export const BackIcon = xp("back");
export const ForwardIcon = xp("forward");
export const UpIcon = xp("up");
export const MsgErrorIcon = xp("msg-error");
export const MsgWarningIcon = xp("msg-warning");
export const MsgInfoIcon = xp("msg-info");
export const MsgQuestionIcon = xp("msg-question");

// XP's shortcut overlay: the same size as the icon, arrow in its corner.
export function ShortcutArrow({ size = 32 }: IconProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- the overlay icon
    <img className="xp-shortcut-arrow" src="/pc/xp/icons/shortcut.png" width={size} height={size} alt="" aria-hidden="true" draggable={false} />
  );
}

// Apps
export const VlcIcon = xp("vlc");
export const WinampIcon = xp("winamp");
export const NeroIcon = xp("nero");
export const CricketIcon = imageIcon("/pc/xp/cricket07.png");
export const FirefoxIcon = imageIcon("/pc/xp/firefox.png");
export const UTorrentIcon = imageIcon("/pc/xp/utorrent.png");

// Games, from each game's official icon art.
export const ViceCityIcon = imageIcon("/pc/xp/games/gta-vc.png");
export const SanAndreasIcon = imageIcon("/pc/xp/games/gta-sa.png");
export const FifaIcon = imageIcon("/pc/xp/games/fifa05.png");
export const CounterStrikeIcon = imageIcon("/pc/xp/games/cs16.png");
export const BrianLaraIcon = imageIcon("/pc/xp/games/blic05.png", 1.75);
export const AgeOfEmpiresIcon = imageIcon("/pc/xp/games/aoe3.png");
export const RollerCoasterIcon = imageIcon("/pc/xp/games/rct3.png");
