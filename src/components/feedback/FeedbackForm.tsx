import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { X, Send, ThumbsUp, ThumbsDown, Meh } from 'lucide-react';

interface FeedbackFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (feedback: FeedbackData) => void;
  trigger: 'manual_stop' | 'connection_reset' | 'error';
}

export interface FeedbackData {
  rating: 'positive' | 'neutral' | 'negative';
  experience: string;
  improvements: string;
  wouldRecommend: 'yes' | 'no' | 'maybe';
  trigger: 'manual_stop' | 'connection_reset' | 'error';
}

export function FeedbackForm({ isOpen, onClose, onSubmit, trigger }: FeedbackFormProps) {
  const [rating, setRating] = useState<'positive' | 'neutral' | 'negative'>('neutral');
  const [experience, setExperience] = useState('');
  const [improvements, setImprovements] = useState('');
  const [wouldRecommend, setWouldRecommend] = useState<'yes' | 'no' | 'maybe'>('maybe');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const feedbackData: FeedbackData = {
      rating,
      experience: experience.trim(),
      improvements: improvements.trim(),
      wouldRecommend,
      trigger
    };

    try {
      await onSubmit(feedbackData);
      onClose();
    } catch (error) {
      console.error('Failed to submit feedback:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getTriggerMessage = () => {
    switch (trigger) {
      case 'manual_stop':
        return 'You stopped the voice session';
      case 'connection_reset':
        return 'The connection was reset';
      case 'error':
        return 'An error occurred';
      default:
        return 'Session ended';
    }
  };

  const getTriggerColor = () => {
    switch (trigger) {
      case 'manual_stop':
        return 'bg-blue-100 text-blue-800';
      case 'connection_reset':
        return 'bg-yellow-100 text-yellow-800';
      case 'error':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>How was your experience?</CardTitle>
              <Badge className={`mt-2 ${getTriggerColor()}`}>
                {getTriggerMessage()}
              </Badge>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="shrink-0"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Overall Rating */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Overall, how was your experience?</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={rating === 'positive' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setRating('positive')}
                  className="flex items-center gap-2"
                >
                  <ThumbsUp className="w-4 h-4" />
                  Great
                </Button>
                <Button
                  type="button"
                  variant={rating === 'neutral' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setRating('neutral')}
                  className="flex items-center gap-2"
                >
                  <Meh className="w-4 h-4" />
                  Okay
                </Button>
                <Button
                  type="button"
                  variant={rating === 'negative' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setRating('negative')}
                  className="flex items-center gap-2"
                >
                  <ThumbsDown className="w-4 h-4" />
                  Poor
                </Button>
              </div>
            </div>

            {/* Experience Description */}
            <div className="space-y-2">
              <Label htmlFor="experience" className="text-sm font-medium">
                Tell us about your experience (optional)
              </Label>
              <Textarea
                id="experience"
                placeholder="What worked well? What was confusing? How did the AI perform?"
                value={experience}
                onChange={(e) => setExperience(e.target.value)}
                className="min-h-[80px]"
              />
            </div>

            {/* Improvements */}
            <div className="space-y-2">
              <Label htmlFor="improvements" className="text-sm font-medium">
                What could we improve? (optional)
              </Label>
              <Textarea
                id="improvements"
                placeholder="Any suggestions for making the experience better?"
                value={improvements}
                onChange={(e) => setImprovements(e.target.value)}
                className="min-h-[60px]"
              />
            </div>

            {/* Recommendation */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Would you recommend this to others?</Label>
              <RadioGroup value={wouldRecommend} onValueChange={(value) => setWouldRecommend(value as 'yes' | 'no' | 'maybe')}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="yes" id="recommend-yes" />
                  <Label htmlFor="recommend-yes">Yes, definitely</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="maybe" id="recommend-maybe" />
                  <Label htmlFor="recommend-maybe">Maybe, with improvements</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="no" id="recommend-no" />
                  <Label htmlFor="recommend-no">No, not in current state</Label>
                </div>
              </RadioGroup>
            </div>

            {/* Submit Buttons */}
            <div className="flex gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isSubmitting}
                className="flex-1"
              >
                Skip
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 flex items-center gap-2"
              >
                {isSubmitting ? (
                  <>Submitting...</>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Send Feedback
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
