'use client';

import { useEffect, useRef, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { PenTool, Eraser, TextCursor, Send, Trash2, MousePointer, Square, ChevronUp, ChevronDown } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
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

export default function CollaboratorPage() {
  const { register, handleSubmit, reset, formState: { errors } } = useForm<ChatForm>({
    resolver: zodResolver(chatSchema)
  });
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
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
            console.log('Image loaded successfully, dimensions:', img.width, 'x', img.height);
            const canvas = canvasRef.current;
            if (canvas) {
              const ctx = canvas.getContext('2d');
              if (ctx) {
                // Get the device pixel ratio
                const pixelRatio = window.devicePixelRatio || 1;
                const { width: cssWidth, height: cssHeight } = canvas.getBoundingClientRect();
                
                console.log('Canvas dimensions:', cssWidth, 'x', cssHeight, 'Pixel ratio:', pixelRatio);
                
                // Clear the canvas properly first
                // DON'T call initializeCanvas() here as it might have side effects
                ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                
                // Clear current shapes
                setShapes([]);
                
                // Fill with background color
                const bgColor = getThemeBackgroundColor();
                ctx.fillStyle = bgColor;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                
                // Reset transform for correct scaling
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                
                // Explicitly handle scale based on device pixel ratio
                if (pixelRatio !== 1) {
                  console.log('Applying pixel ratio scaling:', 1/pixelRatio);
                  ctx.scale(1, 1); // Just use natural scaling
                }
                
                // Draw the image with explicit dimensions to ensure it fits the canvas
                try {
                  console.log('Drawing image with dimensions:', canvas.width, 'x', canvas.height);
                  
                  // Try direct drawing first
                  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                  console.log('Image drawn to canvas - DIRECT METHOD');
                } catch (drawError) {
                  console.error('Error during drawImage:', drawError);
                  
                  // Fallback approach
                  try {
                    // Try with CSS dimensions instead
                    ctx.drawImage(img, 0, 0, cssWidth * pixelRatio, cssHeight * pixelRatio);
                    console.log('Image drawn to canvas - FALLBACK METHOD');
                  } catch (fallbackError) {
                    console.error('Fallback drawing also failed:', fallbackError);
                    toast({
                      title: 'Drawing Error',
                      description: 'Failed to draw the image to canvas',
                      variant: 'destructive'
                    });
                  }
                }
              }
            }
          };

          // Console log the image data (first few characters)
          console.log('Image data received, length:', 
            data.imageData ? data.imageData.length : 0,
            'Preview:', data.imageData ? data.imageData.substring(0, 50) + '...' : 'empty');
          
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

  // Function to get computed background color based on current theme
  const getThemeBackgroundColor = () => {
    if (typeof window !== 'undefined') {
      // Get actual background color from CSS variables
      return getComputedStyle(document.documentElement).getPropertyValue('--background').trim() || '#ffffff';
    }
    return '#ffffff'; // Default fallback
  };

  // Effect to resize canvas and set initial background, accounting for device pixel ratio
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const pixelRatio = window.devicePixelRatio || 1;
      const { width: cssWidth, height: cssHeight } = canvas.getBoundingClientRect();
      
      // Set canvas internal size based on device pixels
      canvas.width = cssWidth * pixelRatio;
      canvas.height = cssHeight * pixelRatio;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Scale the context to draw using CSS pixels
        ctx.scale(pixelRatio, pixelRatio);

        // Initialize background using CSS dimensions
        const bgColor = getThemeBackgroundColor();
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, cssWidth, cssHeight); // Fill using CSS dimensions
      }
    }
    
    // Add observer to detect theme changes
    const observer = new MutationObserver(() => {
      initializeCanvas();
    });
    
    observer.observe(document.documentElement, { 
      attributes: true, 
      attributeFilter: ['class'] 
    });
    
    return () => observer.disconnect();
  }, []);
  
  // Function to initialize/reset canvas - also needs scaling
  const initializeCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pixelRatio = window.devicePixelRatio || 1;
    const { width: cssWidth, height: cssHeight } = canvas.getBoundingClientRect();

    // Ensure internal size is correct
    canvas.width = cssWidth * pixelRatio;
    canvas.height = cssHeight * pixelRatio;

    // Reset transform and scale before clearing
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(pixelRatio, pixelRatio);

    const bgColor = getThemeBackgroundColor();
    ctx.fillStyle = bgColor;
    ctx.clearRect(0, 0, cssWidth, cssHeight); // Use clearRect for safety
    ctx.fillRect(0, 0, cssWidth, cssHeight); // Fill using CSS dimensions
  };
  
  // Clear canvas function
  const clearCanvas = () => {
    // Make sure we're using the current theme background 
    const bgColor = getThemeBackgroundColor();
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }
  };

  // Refine getCoords to use clientX/Y and getBoundingClientRect consistently
  const getCoords = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect(); // Get bounds relative to viewport

    let clientX: number;
    let clientY: number;

    if ('touches' in e) {
      // Handle touch events:
      // - For touchstart/touchmove, use e.touches[0]
      // - For touchend, use e.changedTouches[0]
      const touch = e.touches.length > 0 ? e.touches[0] : e.changedTouches[0];
      clientX = touch.clientX;
      clientY = touch.clientY;
    } else {
      // Mouse event: Use clientX/clientY
      clientX = e.clientX;
      clientY = e.clientY;
    }

    // Calculate coordinates relative to the canvas element's border edge
    // These coordinates are in CSS pixels, which is correct because the context is scaled
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    return { x, y };
  };

  // Function to redraw the entire canvas from the shapes array
  const redrawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 1. Clear canvas (using existing initialize function is good)
    initializeCanvas(); // Ensures background is correct

    // 2. Draw all shapes
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

      // 3. Highlight selected shape (visual part implemented later)
      if (shape.id === selectedShapeId) {
         console.log("Selected shape:", shape.id); 
         // TODO: Implement visual highlighting (e.g., bounding box)
      }
    });
    
    // Reset composite operation to default after drawing everything
    ctx.globalCompositeOperation = 'source-over';
  };

  // Effect to redraw canvas whenever shapes or selection changes
  useEffect(() => {
    redrawCanvas();
  // Ensure all dependencies that might affect drawing or initialization are included
  // Adding penColor, toolSize etc. might cause redraws during preview, handle carefully.
  // For now, only redraw when the actual shapes array or selection changes.
  }, [shapes, selectedShapeId]); 

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
      // Clear canvas drawings (shapes) and all text boxes
      clearCanvas(); // Clears the visual canvas
      setShapes([]); // Clear shapes state
      setTextBoxes([]); // Clear text boxes state
      setSelectedTextBoxId(null);
      setSelectedShapeId(null);
      setFocusedTextBoxId(null);
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

  return (
    <DashboardLayout fullBleed>
      <div className="relative flex-1 w-full h-full bg-background text-foreground overflow-hidden"> {/* Prevent scrollbars on main container */}
        {/* Canvas takes full space */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full cursor-crosshair"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
        
        {/* Image Open Button - show only when currentImageUrl exists */}
        {currentImageUrl && (
          <div className="absolute top-4 right-4 z-40">
            <Button 
              onClick={openImageInNewTab}
              variant="secondary"
              size="sm"
              className="bg-card/80 backdrop-blur-sm"
            >
              Open Image in New Tab
            </Button>
          </div>
        )}
        
        {/* Render Text Boxes Overlay using TextareaAutosize */}
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
              "absolute z-20 group",
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
              className="w-full bg-transparent border-0 ring-0 outline-none focus:ring-0 focus:border-0 focus:outline-none focus:shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 p-1 text-sm text-foreground overflow-hidden resize-none"
              minRows={1}
            />
          </div>
        ))}
        
        {/* Toolbar Overlay - Top Left */}
        <div className="absolute top-4 left-4 z-30 flex flex-col items-start bg-card/80 text-card-foreground backdrop-blur-sm p-3 rounded-lg shadow-md space-y-3 border"> {/* Increased z-index */}
          <div className="flex items-center space-x-2 w-full">
            <Button variant={tool === 'select' ? 'secondary' : 'ghost'} size="icon" onClick={() => setTool('select')} title="Select">
              <MousePointer className="h-5 w-5" />
            </Button>
            <Button variant={tool === 'pencil' ? 'secondary' : 'ghost'} size="icon" onClick={() => setTool('pencil')} title="Pencil">
              <PenTool className="h-5 w-5" />
            </Button>
            <Button variant={tool === 'eraser' ? 'secondary' : 'ghost'} size="icon" onClick={() => setTool('eraser')} title="Eraser">
              <Eraser className="h-5 w-5" />
            </Button>
            <Button variant={tool === 'text' ? 'secondary' : 'ghost'} size="icon" onClick={() => setTool('text')} title="Text">
              <TextCursor className="h-5 w-5" />
            </Button>
            <Button variant={tool === 'box' ? 'secondary' : 'ghost'} size="icon" onClick={() => setTool('box')} title="Draw Box">
              <Square className="h-5 w-5" />
            </Button>
            <input
              type="color"
              value={penColor}
              onChange={e => setPenColor(e.target.value)}
              className="w-8 h-8 p-0 border-none cursor-pointer rounded overflow-hidden"
              title="Select Color"
            />
            <Button variant="ghost" size="icon" onClick={handleDelete} title="Delete Selected / Clear All">
              <Trash2 className="h-5 w-5" />
            </Button>
          </div>
          
          {/* Size Slider - Show for pencil, eraser, and box */}
          {(tool === 'pencil' || tool === 'eraser' || tool === 'box') && (
            <div className="flex items-center w-full space-x-2">
              <span className="text-xs capitalize">{tool} Size: {toolSize}px</span>
              <div className="w-32">
                <Slider
                  value={[toolSize]}
                  min={1}
                  max={20}
                  step={1}
                  onValueChange={(value) => setToolSize(value[0])}
                />
              </div>
            </div>
          )}
        </div>
        {/* Chat Overlay - Bottom Right */}
        <div className={cn(
          "absolute bottom-4 right-4 z-30 w-80 bg-card/90 text-card-foreground backdrop-blur-sm border rounded-lg shadow-lg flex flex-col transition-all duration-300 ease-in-out overflow-hidden",
          "max-h-[85vh]" // Limit overall growth, height determined by content
        )}>
          {/* Always visible Header */}
          <div className="flex items-center justify-between p-3 border-b cursor-pointer" onClick={() => setIsChatExpanded(!isChatExpanded)}>
            <h3 className="text-lg font-semibold">AI Chat</h3>
            <Button variant="ghost" size="icon" className="h-6 w-6">
              {isChatExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />} 
            </Button>
          </div>
          
          {/* Conditionally rendered Message List */}
          <div className={cn(
            "overflow-y-auto p-3 space-y-3 transition-all duration-300 ease-in-out", // Removed flex-1 for now
            isChatExpanded 
              ? "opacity-100 max-h-[calc(80vh-8rem)]" // Max height when expanded, allow scrolling
              : "opacity-0 max-h-0 p-0 m-0" // Collapse fully
          )}>
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={cn(
                  "p-2 rounded-md text-sm",
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
          <form onSubmit={handleSubmit(onSubmit)} className="p-3 border-t">
            <div className="flex items-center space-x-2">
              <Input
                {...register('message')}
                placeholder="Ask AI..."
                className="flex-1"
                disabled={chatMutation.status === 'pending'}
              />
              <Button type="submit" size="icon" disabled={chatMutation.status === 'pending'} title="Send">
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