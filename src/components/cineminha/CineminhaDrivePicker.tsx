import React, { useState } from 'react';
import { ArrowLeft, Cloud, Film, Check, Search, HardDrive, Folder, Clock, Users } from 'lucide-react';
import { CineminhaMedia } from '../../types';

interface CineminhaDrivePickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectMedia: (media: CineminhaMedia) => void;
}

interface DriveVideoFile {
  id: string;
  name: string;
  size: string;
  modified: string;
  duration?: string;
  category: 'meu_drive' | 'compartilhados' | 'recentes';
  sharedWithPartner: boolean;
}

// Default videos available in Google Drive storage
const DRIVE_SAMPLE_FILES: DriveVideoFile[] = [
  {
    id: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
    name: 'Nosso_Filme_Favorito_1080p.mp4',
    size: '1.4 GB',
    modified: 'Hoje, 14:20',
    duration: '1h 45m',
    category: 'compartilhados',
    sharedWithPartner: true,
  },
  {
    id: '1aBcD_ExampleDriveFileIdCinema2026',
    name: 'Serie_Episodio_Especial_Casal.mp4',
    size: '850 MB',
    modified: 'Ontem',
    duration: '52m',
    category: 'meu_drive',
    sharedWithPartner: true,
  },
  {
    id: '1xYz_Viagem_Juntos_Cinema.mp4',
    name: 'Memorias_e_Videos_do_Casal.mp4',
    size: '2.1 GB',
    modified: '3 dias atrás',
    duration: '1h 15m',
    category: 'meu_drive',
    sharedWithPartner: true,
  },
  {
    id: '1QwErTy_Filme_Indie_Comedia.mp4',
    name: 'Comedia_Romantica_HD.mp4',
    size: '1.1 GB',
    modified: 'Semana passada',
    duration: '1h 32m',
    category: 'recentes',
    sharedWithPartner: true,
  },
];

export const CineminhaDrivePicker: React.FC<CineminhaDrivePickerProps> = ({
  isOpen,
  onClose,
  onSelectMedia,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<'meu_drive' | 'compartilhados' | 'recentes'>('compartilhados');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFileId, setSelectedFileId] = useState<string | null>(DRIVE_SAMPLE_FILES[0].id);

  if (!isOpen) return null;

  const filteredFiles = DRIVE_SAMPLE_FILES.filter((file) => {
    const matchesCategory = file.category === selectedCategory || selectedCategory === 'recentes';
    const matchesSearch = file.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const selectedFile = DRIVE_SAMPLE_FILES.find((f) => f.id === selectedFileId);

  const handleConfirmSelection = () => {
    if (!selectedFile) return;

    onSelectMedia({
      sourceType: 'drive',
      title: selectedFile.name.replace('.mp4', '').replace(/_/g, ' '),
      url: `https://drive.google.com/file/d/${selectedFile.id}/preview`,
      driveFileId: selectedFile.id,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col overflow-hidden text-white animate-fade-in">
      {/* Top Header: ← Voltar ... Fechar */}
      <div className="h-14 px-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-2 shrink-0">
        <button
          onClick={onClose}
          className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition flex items-center gap-1 text-xs font-bold cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Voltar</span>
        </button>

        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
            <Cloud className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs font-bold text-white font-display">
            Google Drive • Seletor de Arquivos
          </span>
        </div>

        <button
          onClick={onClose}
          className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold transition cursor-pointer"
        >
          Fechar
        </button>
      </div>

      {/* Drive Search Bar */}
      <div className="p-3 bg-slate-900/60 border-b border-slate-800 shrink-0">
        <div className="relative max-w-lg mx-auto">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Pesquisar vídeos no Google Drive..."
            className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 transition"
          />
        </div>
      </div>

      {/* Drive Categories Tabs */}
      <div className="flex px-3 py-2 bg-slate-900/40 border-b border-slate-800 gap-2 shrink-0 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setSelectedCategory('compartilhados')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
            selectedCategory === 'compartilhados'
              ? 'bg-rose-600 text-white shadow-sm shadow-rose-600/20'
              : 'bg-slate-800/80 text-slate-400 hover:text-white'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Compartilhados comigo</span>
        </button>

        <button
          onClick={() => setSelectedCategory('meu_drive')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
            selectedCategory === 'meu_drive'
              ? 'bg-rose-600 text-white shadow-sm shadow-rose-600/20'
              : 'bg-slate-800/80 text-slate-400 hover:text-white'
          }`}
        >
          <HardDrive className="w-3.5 h-3.5" />
          <span>Meu Drive</span>
        </button>

        <button
          onClick={() => setSelectedCategory('recentes')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
            selectedCategory === 'recentes'
              ? 'bg-rose-600 text-white shadow-sm shadow-rose-600/20'
              : 'bg-slate-800/80 text-slate-400 hover:text-white'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Recentes</span>
        </button>
      </div>

      {/* Drive File List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {filteredFiles.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center text-center p-6 text-slate-400">
            <Folder className="w-10 h-10 text-slate-600 mb-2" />
            <p className="text-xs font-bold text-slate-300">Nenhum vídeo encontrado</p>
            <p className="text-[11px] text-slate-500">Tente buscar por outro termo ou mude de categoria.</p>
          </div>
        ) : (
          filteredFiles.map((file) => {
            const isSelected = selectedFileId === file.id;
            return (
              <div
                key={file.id}
                onClick={() => setSelectedFileId(file.id)}
                className={`p-3 rounded-2xl border transition cursor-pointer flex items-center justify-between gap-3 ${
                  isSelected
                    ? 'bg-rose-950/40 border-rose-500 text-white shadow-md shadow-rose-950/30'
                    : 'bg-slate-900 border-slate-800/80 hover:bg-slate-850 hover:border-slate-700 text-slate-300'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                    isSelected
                      ? 'bg-rose-600 text-white border-rose-400'
                      : 'bg-slate-800 text-rose-400 border-slate-700'
                  }`}>
                    <Film className="w-5 h-5" />
                  </div>

                  <div className="min-w-0">
                    <p className="text-xs font-bold truncate text-white">{file.name}</p>
                    <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                      <span>{file.size}</span>
                      <span>•</span>
                      <span>{file.duration || file.modified}</span>
                      {file.sharedWithPartner && (
                        <>
                          <span>•</span>
                          <span className="text-emerald-400 font-semibold">Acessível para ambos</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="shrink-0 pl-2">
                  <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition ${
                    isSelected
                      ? 'bg-rose-600 border-rose-500 text-white'
                      : 'border-slate-600 text-transparent'
                  }`}>
                    <Check className="w-3 h-3 stroke-[3]" />
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Bottom Confirmation Bar */}
      <div className="p-4 bg-slate-900 border-t border-slate-800 flex items-center justify-between gap-3 shrink-0">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-white truncate">
            {selectedFile ? selectedFile.name : 'Nenhum vídeo selecionado'}
          </p>
          <p className="text-[10px] text-slate-400">
            {selectedFile ? `${selectedFile.size} • Google Drive` : 'Toque em um arquivo acima'}
          </p>
        </div>

        <button
          disabled={!selectedFile}
          onClick={handleConfirmSelection}
          className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 disabled:pointer-events-none text-white text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-rose-600/20 active:scale-95 cursor-pointer shrink-0"
        >
          <Check className="w-3.5 h-3.5" />
          <span>Selecionar Vídeo</span>
        </button>
      </div>
    </div>
  );
};
