import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Send, ThumbsUp, ThumbsDown, Meh, CheckCircle } from 'lucide-react';

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
  const [isSubmitted, setIsSubmitted] = useState(false);

  // Reset form state when opening
  React.useEffect(() => {
    if (isOpen && !isSubmitted) {
      setRating('neutral');
      setExperience('');
      setImprovements('');
      setWouldRecommend('maybe');
      setIsSubmitting(false);
    }
  }, [isOpen, isSubmitted]);

  // Reset submitted state when form closes
  React.useEffect(() => {
    if (!isOpen) {
      setIsSubmitted(false);
    }
  }, [isOpen]);

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
      setIsSubmitted(true);
      // Do not auto-close - let user reload page to try again
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
        return 'Session ended';
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

  // Show success message if submitted
  if (isSubmitted) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-8 px-6 text-center">
            <CheckCircle className="w-16 h-16 text-green-500 mb-4" />
            <h2 className="text-xl font-semibold mb-2">Thank you!</h2>
            <p className="text-muted-foreground mb-4">
              Your feedback has been submitted successfully. We appreciate you taking the time to help us improve.
            </p>
            <div className="text-sm text-muted-foreground">
              Reload the page to try the app again.
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <div>
            <CardTitle>How was your experience?</CardTitle>
            <Badge className={`mt-2 ${getTriggerColor()}`}>
              {getTriggerMessage()}
            </Badge>
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

            {/* Submit Button */}
            <div className="pt-4">
              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full flex items-center gap-2"
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
