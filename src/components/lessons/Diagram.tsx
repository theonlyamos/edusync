import React, { useState } from 'react';
import ReactFlow, { 
  Node, 
  Edge,
  Controls,
  Background,
  useNodesState,
  useEdgesState
} from 'reactflow';
import 'reactflow/dist/style.css';

interface DiagramProps {
  data: {
    nodes: Node[];
    edges: Edge[];
    solution: {
      nodes: Node[];
      edges: Edge[];
    };
  };
  onSubmit: (result: { matched: boolean }) => void;
}

export const Diagram: React.FC<DiagramProps> = ({ data, onSubmit }) => {
  const [nodes, setNodes, onNodesChange] = useNodesState(data.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(data.edges);

  const checkSolution = () => {
    const nodesMatch = nodes.every(node => {
      const solutionNode = data.solution.nodes.find(n => n.id === node.id);
      return solutionNode && node.position.x === solutionNode.position.x;
    });

    const edgesMatch = edges.every(edge => {
      return data.solution.edges.some(e => 
        e.source === edge.source && e.target === edge.target
      );
    });

    onSubmit({ matched: nodesMatch && edgesMatch });
  };

  return (
    <div className="w-full h-[400px] border rounded">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
      >
        <Background />
        <Controls />
      </ReactFlow>
      <button
        onClick={checkSolution}
        className="mt-2 px-4 py-2 bg-blue-500 text-white rounded"
      >
        Check Solution
      </button>
    </div>
  );
};