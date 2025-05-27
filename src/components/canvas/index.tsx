import React, { useCallback, useState } from 'react';
import ReactFlow, {
  ReactFlowProvider,
  addEdge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  Handle,
  Position,
  Edge,
  Connection,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import axios from 'axios';

// CombinedNode: handles multiple inputs and a prompt to generate an image
const CombinedNode = ({ id, data, selected }: { id: string; data: any; selected: boolean }  ) => {
  const { setNodes, getEdges, getNodes } = useReactFlow();
  const [prompt, setPrompt] = useState(data.prompt || '');
  const [ownPreview, setOwnPreview] = useState(data.preview || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Gather all incoming connected node previews
  const edges = getEdges();
  const incoming = edges.filter(e => e.target === id);
  const inputPreviews = incoming
    .map(e => getNodes().find(n => n.id === e.source)?.data?.preview)
    .filter(Boolean);

  const generateCombined = async () => {
    if (!prompt) return;
    setLoading(true);
    setError(null);
    try {
      const payload = {
        prompt,
        inputImageUrls: inputPreviews,
      };
      const response = await axios.post<{ dataUrl: string }>('/api/generate-image', payload);

      const dataUrl = response.data.dataUrl;
      setOwnPreview(dataUrl);
      setNodes(nodes =>
        nodes.map(node =>
          node.id === id ? { ...node, data: { ...node.data, preview: dataUrl, prompt } } : node
        )
      );
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.error || 'Failed to generate image');
    } finally {
      setLoading(false);
    }
  };

  const onDelete = () => setNodes(nodes => nodes.filter(n => n.id !== id));

  const onDownload = () => {
    if (!ownPreview) return;
    const link = document.createElement('a');
    link.href = ownPreview;
    link.download = 'image.png';
    link.click();
  };

  return (
    <div className="relative">
      <Handle type="target" position={Position.Left} />
      <Card className={`p-2 w-64 ${error ? 'border-destructive' : ''}`}>
        <CardHeader><CardTitle>Image Node</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {ownPreview && <img src={ownPreview} alt="preview" className="h-32 w-full object-contain" />}

          {inputPreviews.length > 0 && (
            <div className="grid grid-cols-3 gap-1">
              {inputPreviews.map((url, i) => (
                <div key={i} className="h-12 w-12 overflow-hidden rounded border">
                  <img src={url} alt={`input-${i}`} className="h-full w-full object-cover" />
                </div>
              ))}
            </div>
          )}

          <textarea
            className="w-full border rounded p-1 text-sm"
            placeholder="Describe your image..."
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            rows={2}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button size="sm" onClick={generateCombined} disabled={!prompt || loading}>
            {loading ? 'Generating...' : 'Generate'}
          </Button>
        </CardContent>
      </Card>
      <Handle type="source" position={Position.Right} />

      {selected && (
        <div className="absolute top-1 right-1 z-10">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                <span className="material-icons-outlined text-sm">more_vert</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="bottom" align="end">
              <DropdownMenuItem onSelect={onDownload} disabled={!ownPreview}>Download</DropdownMenuItem>
              <DropdownMenuItem className="text-destructive" onSelect={onDelete}>Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
};

const nodeTypes = { combinedNode: CombinedNode };

function ArtworkFlowWrapper() {
  return (
    <ReactFlowProvider>
      <ArtworkFlow />
    </ReactFlowProvider>
  );
}

function ArtworkFlow() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [idCount, setIdCount] = useState(1);
  const { project } = useReactFlow();

  const onConnect = useCallback((params: Edge | Connection) => setEdges(eds => addEdge(params, eds)), [setEdges]);

  const addNode = () => {
    const id = `combinedNode-${idCount}`;
    const position = project({ x: 50 + (idCount % 5) * 280 , y: 100 + Math.floor(idCount / 5) * 400 });
    setNodes(nds => [...nds, { id, type: 'combinedNode', position, data: {} }]);
    setIdCount(prev => prev + 1);
  };

  return (
    <div style={{ width: '100%', height: 'calc(100vh - 4rem)' }}>
      <div className="absolute top-4 left-4 z-10">
         <Button onClick={addNode}>Add Node</Button>
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        className="bg-muted/40"
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
}

export default ArtworkFlowWrapper;
