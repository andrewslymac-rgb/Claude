"use client";

const EMOJIS = "📄 📚 ✅ 📋 📌 🧹 🐜 🥤 🍋 💡 🏢 👋 📞 💵 🧾 📦 🚚 🛠️ 🔒 ⚠️ 🧪 🧯 📅 🎯 📈 👥 🧑‍💼 🎓 ❤️ ⭐ 🗂️ 📝 🔑 🏠 🧴 🪣 🐀 🕷️ 🐝 🌿".split(" ");

export function EmojiPicker({ onPick, onClose }: { onPick: (emoji: string | null) => void; onClose: () => void }) {
  return (
    <div className="absolute left-0 top-full z-40 mt-2 w-72 rounded-xl border border-line bg-white p-2 shadow-xl" onMouseLeave={onClose}>
      <div className="grid grid-cols-8 gap-1">
        {EMOJIS.map((e) => (
          <button key={e} onClick={() => onPick(e)} className="rounded p-1 text-xl hover:bg-hover">
            {e}
          </button>
        ))}
      </div>
      <button onClick={() => onPick(null)} className="mt-2 w-full rounded-md px-2 py-1 text-sm text-ink-soft hover:bg-hover">
        Remove icon
      </button>
    </div>
  );
}
