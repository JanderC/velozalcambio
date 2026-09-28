import { Search } from "lucide-react";

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export function SearchBar({ value, onChange }: Props) {
  return (
    <div className="search-bar-wrap">
      <Search size={16} className="search-bar-icon" />
      <input
        className="search-bar"
        type="text"
        placeholder="Buscar módulo..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}