'use client';

import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { PenTool, Eraser, TextCursor, Send, Trash2, MousePointer, Square, ChevronUp, ChevronDown, History } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import TextareaAutosize from 'react-textarea-autosize';
// @ts-ignore: axios types installed but not recognized
import axios from 'axios';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { cn } from "@/lib/utils";

const chatSchema = z.object({ message: z.string().min(1) });
type ChatForm = z.infer<typeof chatSchema>;

// Define the structure for a text box
interface TextBox {
  id: string;
  x: number;
  y: number;
  text: string;
  width: number;
}

// Define interfaces for shapes
interface BaseShape {
  id: string;
  type: 'box' | 'path';
  size: number;
}

interface BoxShape extends BaseShape {
  type: 'box';
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

interface PathShape extends BaseShape {
  type: 'path';
  tool: 'pencil' | 'eraser'; // Eraser paths need to be handled differently during redraw
  points: { x: number; y: number }[];
  color: string; // Store color even for eraser for potential future use
}

type Shape = BoxShape | PathShape;

// Define the structure for a canvas checkpoint
interface CanvasCheckpoint {
  id: string;
  timestamp: number;
  baseLayerImageSrc: string | null; // Can be null if it was just background + shapes
  shapes: Shape[]; // Shapes on the canvas at this checkpoint
  previewDataUrl: string; // Thumbnail of the canvas state
}

export default function CollaboratorPage() {
  const { register, handleSubmit, reset, formState: { errors } } = useForm<ChatForm>({
    resolver: zodResolver(chatSchema)
  });
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvasElement, setCanvasElement] = useState<HTMLCanvasElement | null>(null);
  const attachCanvas = useCallback((canvas: HTMLCanvasElement | null) => {
    canvasRef.current = canvas;
    setCanvasElement(canvas);
  }, []);
  const sceneSizeRef = useRef<{ width: number; height: number } | null>(null);
  const drawingRef = useRef(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [penColor, setPenColor] = useState('#000000');
  const [tool, setTool] = useState<'pencil' | 'eraser' | 'text' | 'select' | 'box'>('select');
  const [toolSize, setToolSize] = useState(4);
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [textBoxes, setTextBoxes] = useState<TextBox[]>([]);
  const [lastCreatedTextBoxId, setLastCreatedTextBoxId] = useState<string | null>(null);
  const [focusedTextBoxId, setFocusedTextBoxId] = useState<string | null>(null);
  const [selectedTextBoxId, setSelectedTextBoxId] = useState<string | null>(null);
  const [boxDrawStartCoords, setBoxDrawStartCoords] = useState<{ x: number; y: number } | null>(null);
  const [canvasSnapshot, setCanvasSnapshot] = useState<ImageData | null>(null); // For box preview
  const [isChatExpanded, setIsChatExpanded] = useState(true);

  // State for managing drawn shapes
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);

  // State to hold the AI-generated image as the base layer
  const [baseLayerImage, setBaseLayerImage] = useState<HTMLImageElement | null>(null);

  // State for canvas checkpoints
  const [checkpoints, setCheckpoints] = useState<CanvasCheckpoint[]>([]);

  // State to hold points for the current path being drawn
  const [currentPathPoints, setCurrentPathPoints] = useState<{ x: number; y: number }[] | null>(null);
  // State to hold style for the current path being drawn
  const [currentShapeStyle, setCurrentShapeStyle] = useState<{ penColor: string; toolSize: number; tool: 'pencil' | 'eraser' } | null>(null);

  // Add state variable to store the current image URL for opening in a new tab
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);

  const chatMutation = useMutation({
    // send chat message along with current canvas snapshot
    mutationFn: async (payload: { message: string; canvasData: string }) => {
      const response = await axios.post<{ reply: string | null; imageData: string | null }>('/api/students/collaborator/chat', payload);
      return response.data;
    },
    onSuccess(data) {
      // Handle text reply
      if (data.reply) {
        // Add the AI response to the messages array - ensure it's treated as a string
        const textReply: string = data.reply;
        setMessages(prev => [...prev, { role: 'assistant', content: textReply }]);
      } else if (data.imageData) {
        // If we have no text but have an image, add a default message
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: 'I\'ve generated a new drawing based on your request.'
        }]);
      }

      // Handle image response
      if (data.imageData) {
        // Create a new image element from the base64 data
        const img = new Image();
        
        // --- Create Checkpoint of current state BEFORE applying AI image ---
        const canvas = canvasRef.current;
        if (canvas) {
          const previewDataUrlPre = canvas.toDataURL('image/jpeg', 0.5);
          // Deep copy shapes to avoid issues with state updates
          const currentShapesDeepCopy = JSON.parse(JSON.stringify(shapes)); 

          const checkpointPreAI: CanvasCheckpoint = {
            id: Date.now().toString() + "_pre",
            timestamp: Date.now(),
            baseLayerImageSrc: baseLayerImage ? baseLayerImage.src : null,
            shapes: currentShapesDeepCopy,
            previewDataUrl: previewDataUrlPre,
          };
          setCheckpoints(prev => [checkpointPreAI, ...prev].slice(0, 10));
        }
        // --- End of Pre-AI Checkpoint ---

        // Create a Blob URL for the image data
        try {
          // First convert the base64 string to a binary array
          const binaryString = atob(data.imageData);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          
          // Create a blob from the binary data
          const blob = new Blob([bytes.buffer], { type: 'image/png' });
          
          // Create and store a URL for this blob
          const blobUrl = URL.createObjectURL(blob);
          setCurrentImageUrl(blobUrl);
          
          // Revoke any previous blob URL
          if (currentImageUrl && currentImageUrl.startsWith('blob:')) {
            URL.revokeObjectURL(currentImageUrl);
          }
          
          // For the image element, we can still use the data URL for simplicity
          const dataUrl = `data:image/png;base64,${data.imageData}`;
          
          // Add error handling
          img.onerror = (err) => {
            console.error('Error loading image:', err);
            toast({ 
              title: 'Image Error', 
              description: 'Failed to load the generated image', 
              variant: 'destructive' 
            });
          };
          
          // Handle loading and drawing of the image
          img.onload = () => {
            // Set the base layer image and clear existing shapes.
            setBaseLayerImage(img);
            setShapes([]); // Clear existing user-drawn shapes
          };

          // Set the source of the image to the data URL for drawing on canvas
          img.src = dataUrl;
        } catch (err) {
          console.error('Error processing image data:', err);
          toast({
            title: 'Image Error',
            description: 'Failed to process the image data',
            variant: 'destructive'
          });
        }
      }
    },
    onError() {
      toast({ title: 'Error', description: 'Failed to send message', variant: 'destructive' });
    }
  });

  // The canvas is always white paper, in both themes, so the default black pen
  // shows up and the drawing sent to the AI reads the same either way.
  // (The theme's --background variable holds HSL parts, not a usable colour.)
  const getThemeBackgroundColor = () => '#ffffff';

  // Refine getCoords to use clientX/Y and getBoundingClientRect consistently
  const getCoords = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect(); // Get bounds relative to viewport

    let clientX: number;
    let clientY: number;

    if ('touches' in e) {
      const touch = e.touches.length > 0 ? e.touches[0] : e.changedTouches[0];
      clientX = touch.clientX;
      clientY = touch.clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const scene = sceneSizeRef.current ?? rect;
    const x = (clientX - rect.left) * scene.width / (rect.width || 1);
    const y = (clientY - rect.top) * scene.height / (rect.height || 1);

    return { x, y };
  };

  // Function to redraw the entire canvas from the shapes array
  const redrawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pixelRatio = window.devicePixelRatio || 1;
    const { width: cssWidth, height: cssHeight } = canvas.getBoundingClientRect();
    if (!cssWidth || !cssHeight || drawingRef.current) return;
    // Keep one scene size so images, annotations, and pointer input scale together.
    const scene = sceneSizeRef.current ??= { width: cssWidth, height: cssHeight };
    const pixelWidth = Math.round(cssWidth * pixelRatio);
    const pixelHeight = Math.round(cssHeight * pixelRatio);

    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    ctx.setTransform(pixelWidth / scene.width, 0, 0, pixelHeight / scene.height, 0, 0);
    
    ctx.clearRect(0, 0, scene.width, scene.height);

    // 2. Draw base layer (AI image or background color)
    if (baseLayerImage) {
      ctx.drawImage(baseLayerImage, 0, 0, scene.width, scene.height);
    } else {
      // Fill with background color if no base image
      const bgColor = getThemeBackgroundColor();
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, scene.width, scene.height);
    }

    // 3. Draw all user shapes on top
    shapes.forEach(shape => {
      ctx.lineWidth = shape.size;
      ctx.lineCap = 'round'; // Ensure line cap is set for paths
      ctx.lineJoin = 'round'; // Ensure line join is set for paths
      
      if (shape.type === 'box') {
        ctx.globalCompositeOperation = 'source-over'; // Boxes are always drawn on top
        ctx.strokeStyle = shape.color;
        ctx.strokeRect(shape.x, shape.y, shape.width, shape.height);
      } else if (shape.type === 'path') {
        if (shape.tool === 'eraser') {
          ctx.globalCompositeOperation = 'destination-out';
          // Use a dummy strokeStyle for eraser paths
          ctx.strokeStyle = 'rgba(0,0,0,1)'; 
        } else { // Pencil
          ctx.globalCompositeOperation = 'source-over';
          ctx.strokeStyle = shape.color;
        }
        
        if (shape.points.length > 0) {
          ctx.beginPath();
          ctx.moveTo(shape.points[0].x, shape.points[0].y);
          for (let i = 1; i < shape.points.length; i++) {
            ctx.lineTo(shape.points[i].x, shape.points[i].y);
          }
          ctx.stroke(); 
        }
      }

      // 4. Highlight selected shape (visual part implemented later)
      if (shape.id === selectedShapeId) {
         // TODO: Implement visual highlighting (e.g., bounding box)
      }
    });
    
    // Reset composite operation to default after drawing everything
    ctx.globalCompositeOperation = 'source-over';
  };

  const handleResizeOrThemeChange = useEffectEvent(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { width, height } = canvas.getBoundingClientRect();
    if (!width || !height) return;
    const scene = sceneSizeRef.current ??= { width, height };
    const style = canvas.parentElement?.style;
    style?.setProperty('--canvas-scene-width', `${scene.width}px`);
    style?.setProperty('--canvas-scene-height', `${scene.height}px`);
    style?.setProperty('--canvas-scale-x', String(width / scene.width));
    style?.setProperty('--canvas-scale-y', String(height / scene.height));
    // CSS can resize an active stroke without resetting its bitmap or preview snapshot.
    redrawCanvas();
  });

  useEffect(() => {
    const canvas = canvasElement;
    if (!canvas) return;
    handleResizeOrThemeChange();
    const observer = new MutationObserver(handleResizeOrThemeChange);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    const resizeObserver = new ResizeObserver(handleResizeOrThemeChange);
    resizeObserver.observe(canvas);
    window.addEventListener('resize', handleResizeOrThemeChange);
    return () => {
      observer.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResizeOrThemeChange);
    };
  }, [canvasElement]);

  // Effect to redraw canvas whenever shapes or selection changes
  useEffect(() => {
    redrawCanvas();
  // Ensure all dependencies that might affect drawing or initialization are included
  // Adding penColor, toolSize etc. might cause redraws during preview, handle carefully.
  // For now, only redraw when the actual shapes array or selection changes.
  }, [shapes, selectedShapeId, baseLayerImage]); // Added baseLayerImage

  // Refactored startDrawing
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if ('touches' in e) e.preventDefault();
    const coords = getCoords(e);
    const canvas = canvasRef.current!; // Needed for snapshot
    const ctx = canvas.getContext('2d')!; // Needed for snapshot

    // Deselect any text or shape when starting a new action
    setSelectedTextBoxId(null);
    setSelectedShapeId(null); 

    if (tool === 'select') {
      // --- TODO: Implement hit detection for shapes --- 
      // Find clicked shape, setSelectedShapeId(clickedShape.id)
      // For now, deselect shape if clicking background
      // (Already handled above)
      return;
    }

    if (tool === 'text') {
      // Text box logic remains the same
      const { x, y } = coords;
      const newId = Date.now().toString();
      const newTextBox: TextBox = {
        id: newId, x, y, text: '', width: 150,
      };
      setTextBoxes(prev => [...prev, newTextBox]);
      setLastCreatedTextBoxId(newId);
      setFocusedTextBoxId(newId);
      setSelectedTextBoxId(newId);
      return;
    }

    if (tool === 'box') {
      // Box start logic: still need preview
      setBoxDrawStartCoords(coords);
      drawingRef.current = true;
      setIsDrawing(true);
      // Save snapshot *before* drawing preview on it
      setCanvasSnapshot(ctx.getImageData(0, 0, canvas.width, canvas.height));
      return;
    }

    // --- Pencil/Eraser Start --- 
    if (tool === 'pencil' || tool === 'eraser') {
      const { x, y } = coords;
      // Start accumulating points
      setCurrentPathPoints([{ x, y }]); 
      // Store style for the path being drawn
      setCurrentShapeStyle({ penColor, toolSize, tool }); 
      // Save snapshot for path preview
      setCanvasSnapshot(ctx.getImageData(0, 0, canvas.width, canvas.height)); 
      drawingRef.current = true;
      setIsDrawing(true);
    }
  };

  // Refactored draw
  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if ('touches' in e) e.preventDefault(); 
    if (!isDrawing) return; 

    const coords = getCoords(e);
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;

    // --- Box Preview --- (Still draw directly for preview)
    if (tool === 'box' && boxDrawStartCoords && canvasSnapshot) {
        ctx.putImageData(canvasSnapshot, 0, 0); // Restore the snapshot
        const startX = boxDrawStartCoords.x;
        const startY = boxDrawStartCoords.y;
        const currentX = coords.x;
        const currentY = coords.y;
        const minX = Math.min(startX, currentX);
        const minY = Math.min(startY, currentY);
        const width = Math.abs(currentX - startX);
        const height = Math.abs(currentY - startY);
        // Set preview styles directly
        ctx.strokeStyle = penColor; 
        ctx.lineWidth = toolSize;
        ctx.globalCompositeOperation = 'source-over'; 
        ctx.strokeRect(minX, minY, width, height);

    } else if ((tool === 'pencil' || tool === 'eraser') && currentPathPoints && currentShapeStyle && canvasSnapshot) {
         // --- Pencil/Eraser Draw --- 
         // Add point to the current path state
         const updatedPoints = [...currentPathPoints, coords];
         setCurrentPathPoints(updatedPoints);

         // --- Preview (Optional but Recommended) --- 
         // Restore snapshot and draw current path for preview
         ctx.putImageData(canvasSnapshot, 0, 0);

         // Draw the current path being built
         ctx.lineWidth = currentShapeStyle.toolSize;
         ctx.lineCap = 'round';
         ctx.lineJoin = 'round';
         if (currentShapeStyle.tool === 'eraser') {
             ctx.globalCompositeOperation = 'destination-out';
             ctx.strokeStyle = 'rgba(0,0,0,1)';
         } else {
             ctx.globalCompositeOperation = 'source-over';
             ctx.strokeStyle = currentShapeStyle.penColor;
         }

         if (updatedPoints.length > 0) {
             ctx.beginPath();
             ctx.moveTo(updatedPoints[0].x, updatedPoints[0].y);
             for (let i = 1; i < updatedPoints.length; i++) {
                ctx.lineTo(updatedPoints[i].x, updatedPoints[i].y);
             }
             ctx.stroke();
         }
    }
  };

  // Refactored stopDrawing
  const stopDrawing = (e?: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return; // Avoid running if not drawing
    if (e && 'touches' in e) e.preventDefault();

    const endCoords = e ? getCoords(e) : null; // Get end coords if available
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;

    // --- Box Final --- 
    if (tool === 'box' && boxDrawStartCoords) { 
      // Restore snapshot before adding final shape to state (optional, but cleaner)
      if (canvasSnapshot) ctx.putImageData(canvasSnapshot, 0, 0);

      if (endCoords) { // Only create shape if we have end coordinates
        const startX = boxDrawStartCoords.x;
        const startY = boxDrawStartCoords.y;
        const endX = endCoords.x;
        const endY = endCoords.y;
        const minX = Math.min(startX, endX);
        const minY = Math.min(startY, endY);
        const width = Math.abs(endX - startX);
        const height = Math.abs(endY - startY);

        // Create the Box Shape object
        const newBox: BoxShape = {
          id: Date.now().toString(),
          type: 'box',
          x: minX, y: minY, width, height,
          color: penColor, // Use current penColor
          size: toolSize,   // Use current toolSize
        };
        // Add to shapes state
        setShapes(prev => [...prev, newBox]);
      }
      // Cleanup box drawing state
      setCanvasSnapshot(null); 
      setBoxDrawStartCoords(null);
    }

    // --- Pencil/Eraser Final --- 
    if ((tool === 'pencil' || tool === 'eraser') && currentPathPoints && currentShapeStyle) {
      // Add the final point if available
      const finalPoints = endCoords ? [...currentPathPoints, endCoords] : currentPathPoints;
      
      // Create the Path Shape object
      if (finalPoints.length > 1) { // Only save if path has more than one point
         const newPath: PathShape = {
           id: Date.now().toString(),
           type: 'path',
           tool: currentShapeStyle.tool,
           points: finalPoints,
           color: currentShapeStyle.penColor, // Store style used
           size: currentShapeStyle.toolSize,
         };
         // Add to shapes state
         setShapes(prev => [...prev, newPath]);
      }
      // Cleanup path drawing state
      setCurrentPathPoints(null);
      setCurrentShapeStyle(null);
      setCanvasSnapshot(null); // Clear snapshot for path too
    }

    drawingRef.current = false;
    setIsDrawing(false); // Set drawing false for all tools
  };

  const onSubmit = (data: ChatForm) => {
    const canvasData = canvasRef.current?.toDataURL() || '';
    setMessages(prev => [...prev, { role: 'user', content: data.message }]);
    reset();
    chatMutation.mutate({ message: data.message, canvasData });
  };

  // Handler to update text in a specific text box
  const handleTextBoxChange = (id: string, newText: string) => {
    setTextBoxes(prev => 
      prev.map(box => box.id === id ? { ...box, text: newText } : box)
    );
  };

  // Effect to reset the last created ID after render
  useEffect(() => {
    if (lastCreatedTextBoxId) {
      // Use a timeout to ensure this runs after the render cycle completes
      const timer = setTimeout(() => {
        setLastCreatedTextBoxId(null);
      }, 0); 
      return () => clearTimeout(timer);
    }
  }, [lastCreatedTextBoxId]);

  // Update delete logic
  const handleDelete = () => {
    if (selectedTextBoxId) {
      // Delete selected text box (existing logic)
      setTextBoxes(prev => prev.filter(box => box.id !== selectedTextBoxId));
      setSelectedTextBoxId(null);
      setFocusedTextBoxId(null);
    } else if (selectedShapeId) {
      // --- TODO: Delete selected shape --- 
      setShapes(prev => prev.filter(shape => shape.id !== selectedShapeId));
      setSelectedShapeId(null);
    } else {
      // Clear canvas drawings (shapes), all text boxes, and the base image
      setBaseLayerImage(null); // Clear AI-generated image
      setShapes([]); // Clear shapes state
      setTextBoxes([]); // Clear text boxes state
      setSelectedTextBoxId(null);
      setSelectedShapeId(null);
      setFocusedTextBoxId(null);
      // redrawCanvas will be triggered by state changes (baseLayerImage, shapes)
    }
  };

  // Add a cleanup effect to revoke blob URLs when the component unmounts or URLs change
  useEffect(() => {
    // Return cleanup function
    return () => {
      // If we have a Blob URL, revoke it to prevent memory leaks
      if (currentImageUrl && currentImageUrl.startsWith('blob:')) {
        URL.revokeObjectURL(currentImageUrl);
      }
    };
  }, [currentImageUrl]);

  // Add a function to open the image in a new tab
  const openImageInNewTab = () => {
    if (currentImageUrl) {
      window.open(currentImageUrl, '_blank');
    }
  };

  // Add a function to revert to a checkpoint
  const revertToCheckpoint = (checkpointId: string) => {
    const checkpoint = checkpoints.find(c => c.id === checkpointId);
    if (!checkpoint) {
      toast({ title: 'Error', description: 'Checkpoint not found.', variant: 'destructive' });
      return;
    }

    if (checkpoint.baseLayerImageSrc) {
      const imageToLoad = new Image();
      imageToLoad.onload = () => {
        setBaseLayerImage(imageToLoad);
        setShapes([...checkpoint.shapes]); // Restore shapes from the checkpoint
        toast({ title: 'Canvas Restored', description: `Restored to checkpoint from ${new Date(checkpoint.timestamp).toLocaleTimeString()}` });
      };
      imageToLoad.onerror = () => {
        console.error('Error loading checkpoint image:', checkpoint.baseLayerImageSrc);
        toast({ title: 'Error', description: 'Failed to load image for checkpoint.', variant: 'destructive' });
      };
      imageToLoad.src = checkpoint.baseLayerImageSrc;
    } else {
      // No base image for this checkpoint (it was background color + shapes)
      setBaseLayerImage(null);
      setShapes([...checkpoint.shapes]);
      toast({ title: 'Canvas Restored', description: `Restored to checkpoint from ${new Date(checkpoint.timestamp).toLocaleTimeString()} (custom drawing)` });
    }
  };

  // Function to clear all checkpoints
  const clearCheckpoints = () => {
    setCheckpoints([]);
    toast({ title: 'History Cleared', description: 'Checkpoint history has been cleared.' });
  };

  return (
    <DashboardLayout fullBleed>
      <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-background text-foreground sm:block">
        <div className="relative min-h-0 flex-1 sm:h-full">
        {/* Canvas takes full space */}
        <canvas
          ref={attachCanvas}
          className="absolute inset-0 h-full w-full touch-none cursor-crosshair bg-white"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          onTouchCancel={() => stopDrawing()}
        />
        
        {/* Image Open Button - show only when currentImageUrl exists */}
        {currentImageUrl && (
          <div className="absolute right-2 top-2 z-40 sm:right-4 sm:top-4">
            <Button 
              onClick={openImageInNewTab}
              variant="secondary"
              size="sm"
              className="h-11 bg-card/80 backdrop-blur-sm xl:h-8"
            >
              Open Image in New Tab
            </Button>
          </div>
        )}
        
        {/* Render Text Boxes Overlay using TextareaAutosize */}
        <div className="pointer-events-none absolute left-0 top-0 origin-top-left" style={{
          width: 'var(--canvas-scene-width, 100%)',
          height: 'var(--canvas-scene-height, 100%)',
          transform: 'scale(var(--canvas-scale-x, 1), var(--canvas-scale-y, 1))',
        }}>
        {textBoxes.map(box => (
          <div
            key={box.id}
            style={{
              position: 'absolute',
              left: `${box.x}px`,
              top: `${box.y}px`,
              width: `${box.width}px`,
            }}
            className={cn(
              "pointer-events-auto absolute z-20 group",
              tool === 'select' && "cursor-pointer",
              selectedTextBoxId === box.id && "border-2 border-blue-500 p-0.5" // Selection indicator
            )}
            onClick={() => {
              if (tool === 'select') {
                setSelectedTextBoxId(box.id);
                setFocusedTextBoxId(box.id); // Also focus it
              } else if (tool !== 'text') {
                // Allow clicking into textbox if not select/text tool
                setFocusedTextBoxId(box.id);
                setSelectedTextBoxId(box.id);
              }
            }}
          >
            <TextareaAutosize
              autoFocus={box.id === lastCreatedTextBoxId || box.id === focusedTextBoxId}
              value={box.text}
              onChange={(e) => handleTextBoxChange(box.id, e.target.value)}
              onFocus={() => {
                setFocusedTextBoxId(box.id);
                if (tool === 'select') setSelectedTextBoxId(box.id);
              }}
              onBlur={() => {
                // Don't remove focus immediately on blur if it's selected
                // We might want to keep focus for other actions
                // setFocusedTextBoxId(null); \
              }}
              style={{ width: '100%' }}
              className="w-full bg-transparent border-0 ring-0 outline-none focus:ring-0 focus:border-0 focus:outline-none focus:shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 p-1 text-base xl:text-sm text-foreground overflow-hidden resize-none"
              minRows={1}
            />
          </div>
        ))}
        </div>
        </div>
        
        {/* Toolbar Overlay - Top Left */}
        <div className="z-30 order-first flex shrink-0 flex-col items-start gap-2 border bg-card/80 p-2 text-card-foreground shadow-md backdrop-blur-sm sm:absolute sm:left-4 sm:top-4 sm:gap-3 sm:rounded-lg sm:p-3">
          <div className="flex w-full flex-wrap items-center gap-1 sm:gap-2">
            <Button variant={tool === 'select' ? 'secondary' : 'ghost'} size="icon" className="h-11 w-11 xl:h-9 xl:w-9" onClick={() => setTool('select')} aria-label="Select" title="Select">
              <MousePointer className="h-5 w-5" />
            </Button>
            <Button variant={tool === 'pencil' ? 'secondary' : 'ghost'} size="icon" className="h-11 w-11 xl:h-9 xl:w-9" onClick={() => setTool('pencil')} aria-label="Pencil" title="Pencil">
              <PenTool className="h-5 w-5" />
            </Button>
            <Button variant={tool === 'eraser' ? 'secondary' : 'ghost'} size="icon" className="h-11 w-11 xl:h-9 xl:w-9" onClick={() => setTool('eraser')} aria-label="Eraser" title="Eraser">
              <Eraser className="h-5 w-5" />
            </Button>
            <Button variant={tool === 'text' ? 'secondary' : 'ghost'} size="icon" className="h-11 w-11 xl:h-9 xl:w-9" onClick={() => setTool('text')} aria-label="Text" title="Text">
              <TextCursor className="h-5 w-5" />
            </Button>
            <Button variant={tool === 'box' ? 'secondary' : 'ghost'} size="icon" className="h-11 w-11 xl:h-9 xl:w-9" onClick={() => setTool('box')} aria-label="Draw Box" title="Draw Box">
              <Square className="h-5 w-5" />
            </Button>
            <input
              type="color"
              value={penColor}
              onChange={e => setPenColor(e.target.value)}
              className="h-11 w-11 cursor-pointer overflow-hidden rounded border-none p-0 xl:h-8 xl:w-8"
              aria-label="Select color"
              title="Select Color"
            />
            <Button variant="ghost" size="icon" className="h-11 w-11 xl:h-9 xl:w-9" onClick={handleDelete} aria-label="Delete selected or clear all" title="Delete Selected / Clear All">
              <Trash2 className="h-5 w-5" />
            </Button>
            <CheckpointsBar compact checkpoints={checkpoints} onRevert={revertToCheckpoint} onClearHistory={clearCheckpoints} />
          </div>
          
          {/* Size Slider - Show for pencil, eraser, and box */}
          {(tool === 'pencil' || tool === 'eraser' || tool === 'box') && (
            <div className="flex min-h-11 w-full items-center gap-2 xl:min-h-0">
              <span className="shrink-0 text-xs capitalize">{tool} Size: {toolSize}px</span>
              <div className="min-w-0 flex-1 sm:w-32 sm:flex-none">
                <Slider
                  value={[toolSize]}
                  min={1}
                  max={20}
                  step={1}
                  onValueChange={(value) => setToolSize(value[0])}
                  aria-label={`${tool} size`}
                />
              </div>
            </div>
          )}
        </div>

        {/* Checkpoints Bar - Left Middle */}
        <CheckpointsBar 
          checkpoints={checkpoints} 
          onRevert={revertToCheckpoint} 
          onClearHistory={clearCheckpoints} 
        />

        {/* Chat Overlay - Bottom Right */}
        <div className={cn(
          "z-30 flex min-h-[6.625rem] max-h-[40%] w-full shrink-0 flex-col overflow-hidden border bg-card/90 text-card-foreground shadow-lg backdrop-blur-sm transition-all duration-300 ease-in-out sm:absolute sm:bottom-4 sm:right-4 sm:max-h-[85%] sm:w-80 sm:rounded-lg"
        )}>
          {/* Always visible Header */}
          <button type="button" className="flex min-h-11 shrink-0 items-center justify-between border-b p-2 text-left sm:p-3" aria-expanded={isChatExpanded} aria-controls="collaborator-messages" onClick={() => setIsChatExpanded(!isChatExpanded)}>
            <span className="text-lg font-semibold">AI Chat</span>
            <span className="flex h-6 w-6 items-center justify-center">
              {isChatExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />} 
            </span>
          </button>
          
          {/* Conditionally rendered Message List */}
          <div className={cn(
            "min-h-0 overflow-y-auto space-y-3 transition-all duration-300 ease-in-out",
            isChatExpanded && messages.length > 0
              ? "p-3 opacity-100 max-h-[calc(80dvh-8rem)]"
              : "opacity-0 max-h-0 p-0 m-0" // Collapse fully
          )} id="collaborator-messages">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={cn(
                  "p-2 rounded-md break-words [overflow-wrap:anywhere] text-sm",
                  msg.role === 'assistant'
                    ? "bg-primary/10 text-primary-foreground self-start"
                    : "bg-muted text-muted-foreground self-end"
                )}
              >
                {msg.content}
              </div>
            ))}
          </div>

          {/* Always visible Input Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="shrink-0 border-t p-2 sm:p-3">
            <div className="flex items-center space-x-2">
              <Input
                {...register('message')}
                placeholder="Ask AI..."
                className="h-11 min-w-0 flex-1 text-base xl:h-9 xl:text-sm"
                aria-label="Message AI collaborator"
                disabled={chatMutation.status === 'pending'}
              />
              <Button type="submit" size="icon" className="h-11 w-11 shrink-0 xl:h-9 xl:w-9" disabled={chatMutation.status === 'pending'} aria-label="Send message" title="Send">
                {chatMutation.status === 'pending'
                  ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground"></div>
                  : <Send className="h-4 w-4" />
                }
              </Button>
            </div>
            {errors.message && <p className="text-red-500 text-xs mt-1">{errors.message.message}</p>}
          </form>
        </div>
      </div>
    </DashboardLayout>
  );
} 

// New CheckpointsBar component
const CheckpointsBar = ({ 
  checkpoints, 
  onRevert, 
  onClearHistory,
  compact = false,
}: { 
  checkpoints: CanvasCheckpoint[], 
  onRevert: (id: string) => void, 
  onClearHistory: () => void 
  compact?: boolean
}) => {
  if (checkpoints.length === 0) {
    return null; // Don't render the bar if there are no checkpoints
  }

  const historyContent = (
    <>
      <div className="sticky top-0 mb-1 flex items-center justify-between bg-card/90 py-1">
        <h4 className="text-sm font-semibold text-center flex-grow">History</h4>
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={onClearHistory} 
          className="-mr-1 h-11 w-11 p-0 xl:h-6 xl:w-6"
          aria-label="Clear canvas history"
          title="Clear History"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      {checkpoints.map(cp => (
        <button
          key={cp.id}
          onClick={() => onRevert(cp.id)}
          className={cn(
            "block p-1 rounded-md hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary w-full"
          )}
          title={`Revert to ${new Date(cp.timestamp).toLocaleString()}`}
        >
          <img 
            src={cp.previewDataUrl} 
            alt={`Checkpoint ${new Date(cp.timestamp).toLocaleTimeString()}`} 
            className="w-full h-20 object-cover rounded border border-border mb-1" // Adjusted for vertical bar
          />
          <p className="text-xs text-muted-foreground truncate">{new Date(cp.timestamp).toLocaleTimeString()}</p>
        </button>
      ))}
    </>
  );

  return compact ? (
    <Dialog>
      <DialogTrigger asChild><Button variant="ghost" size="icon" className="h-11 w-11 sm:hidden" aria-label="Open canvas history" title="History"><History className="h-5 w-5" /></Button></DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] overflow-y-auto [&>button]:flex [&>button]:h-11 [&>button]:w-11 [&>button]:items-center [&>button]:justify-center">
        <DialogTitle>Canvas history</DialogTitle>
        <DialogDescription>Restore an earlier drawing.</DialogDescription>
        <div className="space-y-2">{historyContent}</div>
      </DialogContent>
    </Dialog>
  ) : (
    <div className="absolute left-4 top-1/2 z-30 hidden max-h-[calc(100%-8rem)] w-36 -translate-y-1/2 flex-col space-y-2 overflow-y-auto rounded-lg border bg-card/90 p-3 text-card-foreground shadow-md backdrop-blur-sm sm:flex">{historyContent}</div>
  );
};
