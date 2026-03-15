import { useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, Sparkles, Code, Users, Brain, Sigma, Zap, Puzzle } from "lucide-react";

interface PlayCard {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  category: string;
}

const AptitudePlayCards = () => {
  const navigate = useNavigate();
  const [selectedCard, setSelectedCard] = useState<string | null>(null);

  const playCards: PlayCard[] = [
    {
      id: "random",
      title: "Quick Test",
      description: "Fast-paced mixed questions across all categories",
      icon: <Sparkles className="w-6 h-6" />,
      color: "text-primary",
      category: "random",
    },
    {
      id: "coding-theory",
      title: "Coding Theory",
      description: "Test your programming and algorithmic knowledge",
      icon: <Code className="w-6 h-6" />,
      color: "text-emerald-500",
      category: "coding-theory",
    },
    {
      id: "blood-relation",
      title: "Blood Relations",
      description: "Solve complex family relationship puzzles",
      icon: <Users className="w-6 h-6" />,
      color: "text-rose-500",
      category: "blood-relation",
    },
    {
      id: "logical-reasoning",
      title: "Logical Reasoning",
      description: "Enhance your critical thinking skills",
      icon: <Brain className="w-6 h-6" />,
      color: "text-violet-500",
      category: "logical-reasoning",
    },
    {
      id: "number-series",
      title: "Number Series",
      description: "Find patterns and sequences in numbers",
      icon: <Sigma className="w-6 h-6" />,
      color: "text-amber-500",
      category: "number-series",
    },
    {
      id: "quantitative-aptitude",
      title: "Quantitative Aptitude",
      description: "Master mathematical problem-solving",
      icon: <Zap className="w-6 h-6" />,
      color: "text-cyan-500",
      category: "quantitative-aptitude",
    },
    {
      id: "puzzles",
      title: "Puzzles",
      description: "Solve creative and analytical puzzles",
      icon: <Puzzle className="w-6 h-6" />,
      color: "text-orange-500",
      category: "puzzles",
    },
  ];

  const handleCardClick = (card: PlayCard) => {
    setSelectedCard(card.id);
    navigate("/aptitude-test");
  };

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Aptitude Test Categories
          </h1>
          <p className="text-muted-foreground text-lg">
            Choose a category to test your aptitude skills
          </p>
        </div>

        {/* Play Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {playCards.map((card) => (
            <Card
              key={card.id}
              className="border border-border shadow-md hover:shadow-lg transition-all duration-300 hover:scale-105 flex flex-col cursor-pointer group"
              onClick={() => handleCardClick(card)}
            >
              <CardHeader className="flex-1">
                <div className={`w-12 h-12 rounded-lg bg-gradient-to-br from-background to-background/80 border border-border flex items-center justify-center mb-4 group-hover:scale-110 transition-transform ${card.color}`}>
                  {card.icon}
                </div>
                <CardTitle className="text-xl mb-2">{card.title}</CardTitle>
                <CardDescription className="text-sm">
                  {card.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <Button
                  className="w-full bg-gradient-primary hover:opacity-90 transition-opacity text-white"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCardClick(card);
                  }}
                  disabled={selectedCard === card.id}
                >
                  {selectedCard === card.id ? "Starting..." : "Play"}
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Info Section */}
        <div className="mt-12 p-6 bg-card border border-border rounded-lg">
          <h3 className="text-lg font-semibold text-foreground mb-3">
            About the Aptitude Test
          </h3>
          <ul className="space-y-2 text-muted-foreground">
            <li className="flex items-start gap-3">
              <span className="text-primary mt-1">•</span>
              <span>Each test contains multiple questions from your chosen category</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-primary mt-1">•</span>
              <span>You have 20 minutes to complete the test</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-primary mt-1">•</span>
              <span>Each correct answer earns 1 mark with no negative marking</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-primary mt-1">•</span>
              <span>Your results will be shown immediately after submission</span>
            </li>
          </ul>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default AptitudePlayCards;
